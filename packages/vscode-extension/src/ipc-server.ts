import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { JsonRpcResponse } from './types.js';
import { JsonRpcRequestSchema, JSON_RPC_ERRORS } from './types.js';
import { dispatch } from './handlers/index.js';

export class IPCServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private outputChannel: { appendLine: (value: string) => void };

  constructor(outputChannel: { appendLine: (value: string) => void }) {
    this.outputChannel = outputChannel;

    if (process.platform === 'win32') {
      this.socketPath = '\\\\.\\pipe\\multi-vscode-remote-control';
    } else {
      const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { mode: 0o700 });
      }
      this.socketPath = path.join(dir, 'multi-vscode.sock');
    }
  }

  start(): void {
    // Clean up stale socket
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.listen(this.socketPath, () => {
      this.log(`IPC server listening on ${this.socketPath}`);

      // Set socket permissions
      if (process.platform !== 'win32') {
        fs.chmodSync(this.socketPath, 0o600);
      }
    });

    this.server.on('error', (err) => {
      this.log(`Server error: ${err.message}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.log('IPC server stopped');
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
          void this.processRequest(line, socket);
        }
      }
    });

    socket.on('close', () => {
      this.log('Client disconnected');
    });

    socket.on('error', (err) => {
      this.log(`Socket error: ${err.message}`);
    });
  }

  private async processRequest(line: string, socket: net.Socket): Promise<void> {
    let response: JsonRpcResponse;

    try {
      const parsed: unknown = JSON.parse(line);
      const parseResult = JsonRpcRequestSchema.safeParse(parsed);

      if (!parseResult.success) {
        response = {
          jsonrpc: '2.0',
          error: JSON_RPC_ERRORS.INVALID_REQUEST,
          id: null,
        };
      } else {
        response = await dispatch(parseResult.data);
      }
    } catch {
      response = {
        jsonrpc: '2.0',
        error: JSON_RPC_ERRORS.PARSE_ERROR,
        id: null,
      };
    }

    socket.write(JSON.stringify(response) + '\n');
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[multi-vscode-remote-control] ${message}`);
  }
}
