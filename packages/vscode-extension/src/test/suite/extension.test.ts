import * as assert from 'assert';
import * as net from 'node:net';

describe('Multi VSCode Remote Control Integration Tests', () => {
  it('should pass basic assertion', () => {
    assert.ok(true);
  });

  it('should find extension', async () => {
    const vscode = await import('vscode');
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext, 'Extension should be found');
  });

  it('should activate extension on startup', async function() {
    this.timeout(5000);
    
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });

    const vscode = await import('vscode');
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext?.isActive, 'Extension should be active');
  });

  it('should communicate with daemon via test socket', async function () {
    this.timeout(10000);

    const socketPath = process.env.MULTI_VSCODE_SOCKET_PATH;
    if (!socketPath) {
      throw new Error('MULTI_VSCODE_SOCKET_PATH must be set for integration tests');
    }

    const response = await sendJsonRpcRequest(socketPath, {
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });

    assert.strictEqual(response.jsonrpc, '2.0');
    if (!response.result) {
      throw new Error('Expected JSON-RPC result from daemon');
    }
    assert.deepStrictEqual(response.result, {
      message: 'pong',
      timestamp: response.result.timestamp,
    });
    assert.strictEqual(typeof response.result.timestamp, 'number');
    assert.strictEqual(response.id, 1);
  });
});

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: {
    message?: string;
    timestamp?: number;
  };
  error?: {
    code: number;
    message: string;
  };
  id: string | number | null;
}

async function sendJsonRpcRequest(socketPath: string, request: unknown): Promise<JsonRpcResponse> {
  const startedAt = Date.now();
  const timeoutMs = 10000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await sendOnce(socketPath, request);
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Timed out waiting for daemon communication over socket: ${socketPath}`);
}

async function sendOnce(socketPath: string, request: unknown): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Socket request timeout'));
    }, 3000);

    const socket = net.createConnection(socketPath, () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    let buffer = '';

    const onData = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        cleanup();
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          resolve(response);
        } catch (err) {
          reject(new Error(`Failed to parse daemon response: ${String(err)}`));
        }
        return;
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.end();
      socket.destroy();
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
