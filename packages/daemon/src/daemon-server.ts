import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionRegistry } from './extension-registry.js';
import { Router } from './router.js';
import type {
  InternalMessage,
  RegisterMessage,
  RegisterAckMessage,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types.js';
import {
  InternalMessageSchema,
  JsonRpcRequestSchema,
} from './types.js';

export class DaemonServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private registry: ExtensionRegistry;
  private router: Router;
  private socketToExtensionId: Map<net.Socket, string> = new Map();

  constructor() {
    this.registry = new ExtensionRegistry();
    this.router = new Router();

    if (process.platform === 'win32') {
      this.socketPath = '\\\\.\\pipe\\multi-vscode-daemon';
    } else {
      const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { mode: 0o700 });
      }
      this.socketPath = path.join(dir, 'daemon.sock');
    }
  }

  async start(): Promise<void> {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    try {
      await this.listenWithRecovery();
      this.log(`Daemon listening on ${this.socketPath}`);

      // Set socket permissions (Unix only)
      if (process.platform !== 'win32') {
        fs.chmodSync(this.socketPath, 0o600);
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EADDRINUSE') {
        // Socket already in use - another daemon is running
        this.log('Socket already in use - daemon is already running');
        process.exit(0);
        return;
      }

      this.log(`Server error: ${error.message}`);
      throw err;
    }
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clean up socket file (Unix only)
    // Named pipes on Windows are automatically cleaned up
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.log('Daemon stopped');
  }

  private handleConnection(socket: net.Socket): void {
    this.log('Client connected');

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) {
          // 登録済み extension host からのメッセージは Router 側で直接処理する
          if (this.socketToExtensionId.has(socket)) {
            continue;
          }
          void this.processMessage(line, socket);
        }
      }
    });

    socket.on('close', () => {
      const extensionId = this.socketToExtensionId.get(socket);
      if (extensionId) {
        this.unregisterExtension(extensionId);
        this.socketToExtensionId.delete(socket);
        this.log(`Extension host disconnected and unregistered: ${extensionId}`);
      }
      this.log('Client disconnected');
    });

    socket.on('error', (err) => {
      this.log(`Socket error: ${err.message}`);
    });
  }

  private async processMessage(line: string, socket: net.Socket): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(line);

      // 内部プロトコルかJSON-RPCかを判定
      const internalParseResult = InternalMessageSchema.safeParse(parsed);
      if (internalParseResult.success) {
        const response = this.handleInternalMessage(internalParseResult.data, socket);
        socket.write(JSON.stringify(response) + '\n');
        return;
      }

      // JSON-RPC リクエストとして処理
      const jsonRpcParseResult = JsonRpcRequestSchema.safeParse(parsed);
      if (jsonRpcParseResult.success) {
        const response = await this.handleJsonRpcRequest(jsonRpcParseResult.data);
        socket.write(JSON.stringify(response) + '\n');
        return;
      }

      // どちらでもない場合はエラー
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
        id: null,
      };
      socket.write(JSON.stringify(errorResponse) + '\n');
    } catch (err) {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
        id: null,
      };
      socket.write(JSON.stringify(errorResponse) + '\n');
    }
  }

  private handleInternalMessage(
    message: InternalMessage,
    socket: net.Socket,
  ): RegisterAckMessage {
    if (message.type === 'register') {
      return this.handleRegister(message, socket);
    }

    // register-ack, unregister-ack は extension host から daemon への応答なので
    // daemon 側では処理しない
    return {
      type: 'register-ack',
      success: false,
      error: 'Unexpected message type',
    };
  }

  private handleRegister(message: RegisterMessage, socket: net.Socket): RegisterAckMessage {
    try {
      const existing = this.registry.get(message.extensionId);
      if (existing && existing.socket !== socket) {
        existing.socket.destroy();
        this.unregisterExtension(message.extensionId);
      }

      this.registry.register(message.extensionId, socket);
      this.socketToExtensionId.set(socket, message.extensionId);
      this.log(`Registered extension host: ${message.extensionId}`);
      return {
        type: 'register-ack',
        success: true,
      };
    } catch (err) {
      return {
        type: 'register-ack',
        success: false,
        error: String(err),
      };
    }
  }

  private async handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const maxAttempts = this.registry.size();
    if (maxAttempts === 0) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'No extension host available',
        },
        id: request.id ?? null,
      };
    }

    let lastError: unknown;

    // round-robin の選択順に従って、利用可能な extension host へ順次ルーティング
    for (let i = 0; i < maxAttempts; i += 1) {
      const targetHost = this.registry.selectNext();
      if (!targetHost) {
        break;
      }

      try {
        this.log(`Routing request to ${targetHost.extensionId}: ${request.method}`);
        const response = await this.router.route(request, targetHost);
        return response;
      } catch (err) {
        lastError = err;
        const message = String(err);
        this.log(`Routing failed for ${targetHost.extensionId}: ${message}`);

        // 死んだ socket は registry から除外して次の host へフェイルオーバー
        if (
          message.includes('EPIPE') ||
          message.includes('ECONNRESET') ||
          message.includes('Socket error')
        ) {
          this.unregisterExtension(targetHost.extensionId);
          this.log(`Pruned unreachable extension host: ${targetHost.extensionId}`);
          continue;
        }

        break;
      }
    }

    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `Routing failed: ${String(lastError ?? 'unknown error')}`,
      },
      id: request.id ?? null,
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [multi-vscode-daemon] ${message}`);
  }

  private async listenWithRecovery(): Promise<void> {
    try {
      await this.listenOnce();
      return;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;

      if (
        process.platform !== 'win32' &&
        error.code === 'EADDRINUSE' &&
        await this.isStaleSocket()
      ) {
        this.log('Detected stale daemon socket (ECONNREFUSED), unlinking and retrying');
        fs.unlinkSync(this.socketPath);
        await this.listenOnce();
        return;
      }

      throw err;
    }
  }

  private async listenOnce(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        cleanup();
        resolve();
      };

      const onError = (err: NodeJS.ErrnoException) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this.server!.off('listening', onListening);
        this.server!.off('error', onError);
      };

      this.server!.once('listening', onListening);
      this.server!.once('error', onError);
      this.server!.listen(this.socketPath);
    });
  }

  private async isStaleSocket(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection(this.socketPath);

      socket.once('connect', () => {
        socket.end();
        resolve(false);
      });

      socket.once('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'ECONNREFUSED');
      });
    });
  }

  private unregisterExtension(extensionId: string): void {
    const host = this.registry.get(extensionId);
    if (host) {
      this.socketToExtensionId.delete(host.socket);
      this.registry.unregister(extensionId);
    }
  }
}
