import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  existsSyncMock,
  mkdirSyncMock,
  unlinkSyncMock,
  chmodSyncMock,
  createServerMock,
  dispatchMock,
  homedirMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  unlinkSyncMock: vi.fn(),
  chmodSyncMock: vi.fn(),
  createServerMock: vi.fn(),
  dispatchMock: vi.fn(),
  homedirMock: vi.fn(() => '/home/test-user'),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  unlinkSync: unlinkSyncMock,
  chmodSync: chmodSyncMock,
}));

vi.mock('node:os', () => ({
  homedir: homedirMock,
}));

vi.mock('node:net', () => ({
  createServer: createServerMock,
}));

vi.mock('./handlers/index.js', () => ({
  dispatch: dispatchMock,
}));

import { IPCServer } from './ipc-server.js';

class MockServer extends EventEmitter {
  listen = vi.fn((_: string, callback?: () => void) => {
    callback?.();
  });
  close = vi.fn();
}

class MockSocket extends EventEmitter {
  write = vi.fn();
}

const originalPlatform = process.platform;

describe('IPCServer', () => {
  const appendLine = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    appendLine.mockReset();
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    unlinkSyncMock.mockReset();
    chmodSyncMock.mockReset();
    createServerMock.mockReset();
    dispatchMock.mockReset();
    homedirMock.mockReset();
    homedirMock.mockReturnValue('/home/test-user');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('creates socket directory when missing on unix', () => {
    existsSyncMock.mockReturnValue(false);

    new IPCServer({ appendLine });

    expect(mkdirSyncMock).toHaveBeenCalledWith('/home/test-user/.multi-vscode-remote-control', {
      mode: 0o700,
    });
  });

  it('does not create directory when it already exists', () => {
    existsSyncMock.mockReturnValue(true);

    new IPCServer({ appendLine });

    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });

  it('start removes stale socket, listens, and chmods socket', () => {
    const server = new MockServer();
    existsSyncMock.mockReturnValue(true);
    createServerMock.mockReturnValue(server);
    const ipcServer = new IPCServer({ appendLine });

    ipcServer.start();

    expect(unlinkSyncMock).toHaveBeenCalledWith(
      '/home/test-user/.multi-vscode-remote-control/multi-vscode.sock',
    );
    expect(server.listen).toHaveBeenCalledWith(
      '/home/test-user/.multi-vscode-remote-control/multi-vscode.sock',
      expect.any(Function),
    );
    expect(chmodSyncMock).toHaveBeenCalledWith(
      '/home/test-user/.multi-vscode-remote-control/multi-vscode.sock',
      0o600,
    );
    expect(appendLine).toHaveBeenCalledWith(
      '[multi-vscode-remote-control] IPC server listening on /home/test-user/.multi-vscode-remote-control/multi-vscode.sock',
    );
  });

  it('stop closes server and unlinks socket on unix', () => {
    const server = new MockServer();
    existsSyncMock.mockReturnValue(true);
    createServerMock.mockReturnValue(server);
    const ipcServer = new IPCServer({ appendLine });
    ipcServer.start();

    ipcServer.stop();

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(unlinkSyncMock).toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith('[multi-vscode-remote-control] IPC server stopped');
  });

  it('start logs server error events', () => {
    const server = new MockServer();
    existsSyncMock.mockReturnValue(false);
    createServerMock.mockReturnValue(server);
    const ipcServer = new IPCServer({ appendLine });
    ipcServer.start();

    server.emit('error', new Error('boom'));

    expect(appendLine).toHaveBeenCalledWith('[multi-vscode-remote-control] Server error: boom');
  });

  it('handleConnection processes valid request and writes response', async () => {
    const socket = new MockSocket();
    dispatchMock.mockResolvedValue({ jsonrpc: '2.0', result: { ok: true }, id: 1 });
    const ipcServer = new IPCServer({ appendLine });

    await (ipcServer as any).processRequest('{"jsonrpc":"2.0","method":"ping","id":1}', socket);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(socket.write).toHaveBeenCalledWith('{"jsonrpc":"2.0","result":{"ok":true},"id":1}\n');
  });

  it('processRequest returns invalid request when schema validation fails', async () => {
    const socket = new MockSocket();
    const ipcServer = new IPCServer({ appendLine });

    await (ipcServer as any).processRequest('{"foo":"bar"}', socket);

    expect(socket.write).toHaveBeenCalledWith(
      '{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}\n',
    );
  });

  it('processRequest returns parse error on malformed JSON', async () => {
    const socket = new MockSocket();
    const ipcServer = new IPCServer({ appendLine });

    await (ipcServer as any).processRequest('{bad-json}', socket);

    expect(socket.write).toHaveBeenCalledWith(
      '{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"},"id":null}\n',
    );
  });

  it('handleConnection logs connect/close/socket errors and processes line buffer', () => {
    const socket = new MockSocket();
    const ipcServer = new IPCServer({ appendLine });
    const processRequestSpy = vi.spyOn(ipcServer as any, 'processRequest').mockResolvedValue(undefined);

    (ipcServer as any).handleConnection(socket);
    socket.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"ping","id":1}\n{"jsonrpc":"2.0"'));
    socket.emit('data', Buffer.from(',"method":"ping","id":2}\n'));
    socket.emit('close');
    socket.emit('error', new Error('socket-boom'));

    expect(processRequestSpy).toHaveBeenCalledTimes(2);
    expect(appendLine).toHaveBeenCalledWith('[multi-vscode-remote-control] Client connected');
    expect(appendLine).toHaveBeenCalledWith('[multi-vscode-remote-control] Client disconnected');
    expect(appendLine).toHaveBeenCalledWith('[multi-vscode-remote-control] Socket error: socket-boom');
  });

  it('uses named pipe path and skips unix fs operations on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    existsSyncMock.mockReturnValue(true);
    const server = new MockServer();
    createServerMock.mockReturnValue(server);
    const ipcServer = new IPCServer({ appendLine });

    ipcServer.start();
    ipcServer.stop();

    expect(server.listen).toHaveBeenCalledWith(
      '\\\\.\\pipe\\multi-vscode-remote-control',
      expect.any(Function),
    );
    expect(unlinkSyncMock).not.toHaveBeenCalled();
    expect(chmodSyncMock).not.toHaveBeenCalled();
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });
});
