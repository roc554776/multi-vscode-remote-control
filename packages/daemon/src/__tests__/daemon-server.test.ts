import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DaemonServer } from '../daemon-server.js';
import { spawn } from 'node:child_process';

void describe('DaemonServer Integration', () => {
  let daemon: DaemonServer;
  let daemonSocketPath: string;
  
  before(async () => {
    daemon = new DaemonServer();
    await daemon.start();
    
    if (process.platform === 'win32') {
      daemonSocketPath = '\\\\.\\pipe\\multi-vscode-daemon';
    } else {
      const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
      daemonSocketPath = path.join(dir, 'daemon.sock');
    }
    
    // daemon の起動を待つ
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      if (process.platform !== 'win32' && fs.existsSync(daemonSocketPath)) {
        break;
      }
    }
  });

  after(() => {
    daemon.stop();
  });

  void it('should enforce singleton - second daemon should exit gracefully', async () => {
    const daemonEntryPath = new URL('../index.js', import.meta.url).pathname;

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, [daemonEntryPath], {
        stdio: 'ignore',
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        resolve(code);
      });
    });

    assert.strictEqual(exitCode, 0);
  });

  void it('should register extension host', async () => {
    const response = await sendMessage({
      type: 'register',
      extensionId: 'test-ext-1',
    });
    
    if (typeof response !== 'object' || response === null) {
      throw new Error('Invalid response');
    }
    
    if (!('type' in response) || !('success' in response)) {
      throw new Error('Invalid response format');
    }
    
    const r: Record<string, unknown> = response;
    assert.strictEqual(r['type'], 'register-ack');
    assert.strictEqual(r['success'], true);
  });

  void it('should return error when no extension host is available', async () => {
    // JSON-RPC リクエストを送る
    const response = await sendMessage({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });
    
    if (typeof response !== 'object' || response === null) {
      throw new Error('Invalid response');
    }
    
    const r: Record<string, unknown> = response;
    assert.strictEqual(r['jsonrpc'], '2.0');
    
    const error = r['error'];
    if (typeof error !== 'object' || error === null) {
      throw new Error('Invalid error');
    }
    
    const errorObj: Record<string, unknown> = error;
    assert.strictEqual(errorObj['code'], -32603);
  });

  void it('should recover from stale socket on startup (unix)', async () => {
    if (process.platform === 'win32') {
      return;
    }

    daemon.stop();
    await createStaleSocket(daemonSocketPath);
    assert.strictEqual(fs.existsSync(daemonSocketPath), true);

    daemon = new DaemonServer();
    await daemon.start();

    const response = await sendMessage({
      type: 'register',
      extensionId: 'test-ext-recovery',
    });

    if (typeof response !== 'object' || response === null) {
      throw new Error('Invalid response');
    }
    
    const r: Record<string, unknown> = response;
    assert.strictEqual(r['type'], 'register-ack');
    assert.strictEqual(r['success'], true);
  });

  async function sendMessage(message: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(daemonSocketPath, () => {
        socket.write(JSON.stringify(message) + '\n');
      });

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
              socket.end();
              resolve(response);
              return;
            } catch (err) {
              cleanup();
              socket.end();
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
        socket.destroy();
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

  async function createStaleSocket(socketPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const script = [
        "const net=require('node:net')",
        "const fs=require('node:fs')",
        'const p=process.argv[1]',
        'try{fs.unlinkSync(p)}catch{}',
        'const s=net.createServer()',
        "s.listen(p,()=>{process.kill(process.pid,'SIGKILL')})",
      ].join(';');

      const child = spawn(process.execPath, ['-e', script, socketPath], {
        stdio: 'ignore',
      });

      child.on('error', reject);
      child.on('exit', () => {
        resolve();
      });
    });
  }
});
