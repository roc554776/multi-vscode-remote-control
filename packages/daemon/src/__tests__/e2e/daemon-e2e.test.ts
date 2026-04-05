import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DaemonServer } from '../../daemon-server.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

void describe('DaemonServer E2E', { concurrency: 1 }, () => {
  let daemon: DaemonServer;
  const extensionSockets: net.Socket[] = [];
  const daemonSocketPath = getDaemonSocketPath();

  beforeEach(async () => {
    daemon = new DaemonServer();
    await daemon.start();
    await waitForDaemonReady(daemonSocketPath);
  });

  afterEach(async () => {
    for (const socket of extensionSockets) {
      socket.end();
      socket.destroy();
    }
    extensionSockets.length = 0;
    daemon.stop();
    await delay(20);
  });

  void it('daemon 起動と接続確立', async () => {
    const socket = await connectSocket(daemonSocketPath);
    socket.end();
    socket.destroy();
    assert.ok(true);
  });

  void it('extension 登録と ping/pong', async () => {
    const extensionSocket = await registerExtensionHost(
      daemonSocketPath,
      'ext-ping',
      (request) => ({
        jsonrpc: '2.0',
        result: {
          message: 'pong',
          from: 'ext-ping',
          method: request.method,
        },
        id: request.id ?? null,
      }),
    );
    extensionSockets.push(extensionSocket);

    const response = await sendJson(daemonSocketPath, {
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    });

    assert.strictEqual(response.jsonrpc, '2.0');
    assert.deepStrictEqual(response.result, {
      message: 'pong',
      from: 'ext-ping',
      method: 'ping',
    });
    assert.strictEqual(response.id, 1);
  });

  void it('複数 extension host のラウンドロビン', async () => {
    extensionSockets.push(
      await registerExtensionHost(daemonSocketPath, 'ext-a', (request) => ({
        jsonrpc: '2.0',
        result: { extensionId: 'ext-a' },
        id: request.id ?? null,
      })),
    );

    extensionSockets.push(
      await registerExtensionHost(daemonSocketPath, 'ext-b', (request) => ({
        jsonrpc: '2.0',
        result: { extensionId: 'ext-b' },
        id: request.id ?? null,
      })),
    );

    const responses = await Promise.all([
      sendJson(daemonSocketPath, { jsonrpc: '2.0', method: 'ping', id: 1 }),
      sendJson(daemonSocketPath, { jsonrpc: '2.0', method: 'ping', id: 2 }),
      sendJson(daemonSocketPath, { jsonrpc: '2.0', method: 'ping', id: 3 }),
      sendJson(daemonSocketPath, { jsonrpc: '2.0', method: 'ping', id: 4 }),
    ]);

    const routedIds = responses.map((response) => {
      if (
        typeof response.result === 'object' &&
        response.result !== null &&
        'extensionId' in response.result &&
        typeof (response.result as Record<string, unknown>)['extensionId'] === 'string'
      ) {
        return (response.result as Record<string, unknown>)['extensionId'] as string;
      }
      throw new Error('Invalid response result');
    });

    assert.notStrictEqual(routedIds[0], routedIds[1]);
    assert.strictEqual(routedIds[0], routedIds[2]);
    assert.strictEqual(routedIds[1], routedIds[3]);
  });

  void it('接続断による自動登録解除', async () => {
    const extA = await registerExtensionHost(daemonSocketPath, 'ext-a', (request) => ({
      jsonrpc: '2.0',
      result: { extensionId: 'ext-a' },
      id: request.id ?? null,
    }));
    extensionSockets.push(extA);

    extensionSockets.push(
      await registerExtensionHost(daemonSocketPath, 'ext-b', (request) => ({
        jsonrpc: '2.0',
        result: { extensionId: 'ext-b' },
        id: request.id ?? null,
      })),
    );

    extA.end();
    extA.destroy();
    await delay(50);

    const response = await sendJson(daemonSocketPath, {
      jsonrpc: '2.0',
      method: 'ping',
      id: 10,
    });

    if (
      typeof response.result === 'object' &&
      response.result !== null &&
      'extensionId' in response.result &&
      typeof (response.result as Record<string, unknown>)['extensionId'] === 'string'
    ) {
      const extId = (response.result as Record<string, unknown>)['extensionId'] as string;
      assert.strictEqual(extId, 'ext-b');
    } else {
      throw new Error('Invalid response result');
    }
  });

  void it('JSON-RPC エラーケース', async () => {
    const parseError = await sendRaw(daemonSocketPath, '{"jsonrpc":"2.0","method":"ping"');
    assert.strictEqual(parseError.error?.code, -32700);
    assert.strictEqual(parseError.id, null);

    const invalidRequest = await sendJson(daemonSocketPath, {
      invalid: true,
    });
    assert.strictEqual(invalidRequest.error?.code, -32600);
    assert.strictEqual(invalidRequest.id, null);

    const noHost = await sendJson(daemonSocketPath, {
      jsonrpc: '2.0',
      method: 'ping',
      id: 'no-host',
    });
    assert.strictEqual(noHost.error?.code, -32603);
    assert.strictEqual(noHost.id, 'no-host');
  });
});

async function registerExtensionHost(
  daemonSocketPath: string,
  extensionId: string,
  onRequest: (request: JsonRpcRequest) => JsonRpcResponse,
): Promise<net.Socket> {
  const socket = await connectSocket(daemonSocketPath);
  const registerAck = await sendAndReceive(socket, {
    type: 'register',
    extensionId,
  });

  assert.strictEqual(registerAck.type, 'register-ack');
  assert.strictEqual(registerAck.success, true);

  let buffer = '';
  socket.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(line);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'jsonrpc' in parsed &&
          'method' in parsed &&
          typeof (parsed as Record<string, unknown>)['jsonrpc'] === 'string' &&
          typeof (parsed as Record<string, unknown>)['method'] === 'string'
        ) {
          const p: Record<string, unknown> = parsed;
          const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            method: p['method'] as string,
            params: 'params' in p ? p['params'] : undefined,
            id: 'id' in p ? (p['id'] as string | number | null | undefined) : undefined,
          };
          const response = onRequest(request);
          socket.write(JSON.stringify(response) + '\n');
        }
      } catch {
        // ignore malformed payload in test helper
      }
    }
  });

  return socket;
}

async function sendJson(daemonSocketPath: string, message: unknown): Promise<JsonRpcResponse> {
  return sendRaw(daemonSocketPath, JSON.stringify(message));
}

async function sendRaw(daemonSocketPath: string, line: string): Promise<JsonRpcResponse> {
  const socket = await connectSocket(daemonSocketPath);
  try {
    const response = await sendAndReceive(socket, line);
    if (
      typeof response === 'object' &&
      response !== null &&
      'jsonrpc' in response &&
      'id' in response
    ) {
      // Type assertion here is safe after validation
      const jsonrpcResponse: JsonRpcResponse = response as JsonRpcResponse;
      return jsonrpcResponse;
    }
    throw new Error('Invalid response');
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function sendAndReceive(socket: net.Socket, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
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
          resolve(JSON.parse(line));
        } catch (err) {
          reject(new Error(`Failed to parse response: ${String(err)}`));
        }
        return;
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
      socket.setTimeout(0);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('timeout', onTimeout);
    socket.setTimeout(10000);

    if (typeof message === 'string') {
      socket.write(message + '\n');
    } else {
      socket.write(JSON.stringify(message) + '\n');
    }
  });
}

async function connectSocket(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    }, 10000);

    const socket = net.createConnection(socketPath, () => {
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

function getDaemonSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\multi-vscode-daemon';
  }
  const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
  return path.join(dir, 'daemon.sock');
}

async function waitForDaemonReady(socketPath: string): Promise<void> {
  const timeoutMs = 5000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
      return;
    }
    try {
      const socket = await connectSocket(socketPath);
      socket.end();
      socket.destroy();
      return;
    } catch {
      await delay(20);
    }
  }

  throw new Error(`Daemon socket not ready: ${socketPath}`);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
