import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import * as path from 'node:path';
import * as os from 'node:os';
import { DaemonSpawner } from './daemon-spawner.js';
import { dispatch } from './handlers/index.js';
import { JsonRpcRequestSchema } from './types.js';
import type { JsonRpcRequest, JsonRpcResponse } from './types.js';

interface RegisterMessage {
  type: 'register';
  extensionId: string;
}

interface RegisterAckMessage {
  type: 'register-ack';
  success: boolean;
  error?: string;
}

export class DaemonClient {
  private extensionId: string;
  private daemonSocketPath: string;
  private spawner: DaemonSpawner;
  private outputChannel: { appendLine: (value: string) => void };
  private daemonConnection: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(outputChannel: { appendLine: (value: string) => void }) {
    this.extensionId = randomUUID();
    this.outputChannel = outputChannel;
    this.spawner = new DaemonSpawner();

    if (process.platform === 'win32') {
      this.daemonSocketPath = '\\\\.\\pipe\\multi-vscode-daemon';
    } else {
      const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
      this.daemonSocketPath = path.join(dir, 'daemon.sock');
    }
  }

  async start(): Promise<void> {
    // daemon が起動していなければ spawn し、ready になるまで待つ
    await this.spawner.ensureDaemonRunning((msg) => this.log(msg));
    this.stopping = false;
    await this.connectAndRegister();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.daemonConnection) {
      this.daemonConnection.end();
      this.daemonConnection.destroy();
      this.daemonConnection = null;
    }
  }

  private async connectAndRegister(): Promise<void> {
    const socket = await this.openDaemonConnection();
    this.daemonConnection = socket;

    const message: RegisterMessage = {
      type: 'register',
      extensionId: this.extensionId,
    };

    const response = await this.sendRegisterMessage(socket, message);

    if (response.type === 'register-ack') {
      if (response.success) {
        this.log(`Registered to daemon: ${this.extensionId}`);
        
        // Setup request handler for incoming requests from daemon
        this.setupRequestHandler(socket);
        
        socket.on('close', () => {
          this.log('Daemon connection closed');
          if (!this.stopping) {
            this.scheduleReconnect();
          }
        });
        socket.on('error', (err) => {
          this.log(`Daemon connection error: ${err.message}`);
        });
      } else {
        throw new Error(`Failed to register: ${response.error ?? 'unknown error'}`);
      }
    } else {
      throw new Error('Unexpected response type');
    }
  }

  private async openDaemonConnection(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      }, 10000);

      const socket = net.createConnection(this.daemonSocketPath, () => {
        clearTimeout(timeout);
        socket.setTimeout(0);
        resolve(socket);
      });

      socket.once('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        reject(new Error(`Socket error: ${err.message}`));
      });
    });
  }

  private async sendRegisterMessage(
    socket: net.Socket,
    message: RegisterMessage,
  ): Promise<RegisterAckMessage> {
    return new Promise((resolve, reject) => {
      socket.write(JSON.stringify(message) + '\n');

      let buffer = '';

      const onData = (data: Buffer) => {
        buffer += data.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: unknown = JSON.parse(line);
              cleanup();
              socket.setTimeout(0);
              resolve(response as RegisterAckMessage);
              return;
            } catch (err) {
              cleanup();
              reject(new Error(`Failed to parse response: ${String(err)}`));
              return;
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`Socket error: ${err.message}`));
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error('Request timeout'));
      };

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('timeout', onTimeout);
      socket.setTimeout(10000);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopping) {
        return;
      }
      void this.connectAndRegister().catch((err) => {
        this.log(`Reconnect failed: ${String(err)}`);
        this.scheduleReconnect();
      });
    }, 1000);
  }

  private setupRequestHandler(socket: net.Socket): void {
    let buffer = '';
    
    socket.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        void this.handleRequest(line, socket);
      }
    });
  }

  private async handleRequest(line: string, socket: net.Socket): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(line);
      const parseResult = JsonRpcRequestSchema.safeParse(parsed);
      
      if (!parseResult.success) {
        this.log(`Invalid JSON-RPC request: ${line}`);
        return;
      }
      
      const request = parseResult.data;
      this.log(`Handling request: ${request.method}`);
      
      const response: JsonRpcResponse = await dispatch(request);
      socket.write(JSON.stringify(response) + '\n');
    } catch (err) {
      this.log(`Failed to handle request: ${String(err)}`);
    }
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[multi-vscode-remote-control] ${message}`);
  }
}
