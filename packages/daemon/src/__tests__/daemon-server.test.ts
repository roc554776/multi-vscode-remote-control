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
      child.on('exit', (code) => resolve(code));
    });

    assert.strictEqual(exitCode, 0);
  });

  void it('should register extension host', async () => {
    const response = await sendMessage({
      type: 'register',
      extensionId: 'test-ext-1',
    });
    
    assert.strictEqual(response.type, 'register-ack');
    assert.strictEqual(response.success, true);
  });

  void it('should return error when no extension host is available', async () => {
    // JSON-RPC リクエストを送る
    const response = await sendMessage({
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });
    
    assert.strictEqual(response.jsonrpc, '2.0');
    assert.ok(response.error);
    assert.strictEqual(response.error.code, -32603);
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

    assert.strictEqual(response.type, 'register-ack');
    assert.strictEqual(response.success, true);
  });

  async function sendMessage(message: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(daemonSocketPath, () => {
        socket.write(JSON.stringify(message) + '\n');
      });

      let buffer = '';

      socket.on('data', (data) => {
        buffer += data.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: unknown = JSON.parse(line);
              socket.end();
              resolve(response);
              return;
            } catch (err) {
              socket.end();
              reject(new Error(`Failed to parse response: ${String(err)}`));
              return;
            }
          }
        }
      });

      socket.on('error', (err) => {
        reject(new Error(`Socket error: ${err.message}`));
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Request timeout'));
      });

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
      child.on('exit', () => resolve());
    });
  }
});
