import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureDaemonRunningMock,
  stopSpawnedDaemonMock,
  dispatchMock,
} = vi.hoisted(() => ({
  ensureDaemonRunningMock: vi.fn(),
  stopSpawnedDaemonMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'extension-id-123'),
}));

vi.mock('./daemon-socket-path.js', () => ({
  getDaemonSocketPath: vi.fn(() => '/tmp/daemon.sock'),
}));

vi.mock('./daemon-spawner.js', () => ({
  DaemonSpawner: vi
    .fn()
    .mockImplementation(function MockDaemonSpawner(this: any) {
      this.ensureDaemonRunning = ensureDaemonRunningMock;
      this.stopSpawnedDaemon = stopSpawnedDaemonMock;
    }),
}));

vi.mock('./handlers/index.js', () => ({
  dispatch: dispatchMock,
}));

import { DaemonClient } from './daemon-client.js';

class MockSocket extends EventEmitter {
  write = vi.fn();
  end = vi.fn();
  destroy = vi.fn();
  setTimeout = vi.fn();
}

describe('DaemonClient', () => {
  const appendLine = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    ensureDaemonRunningMock.mockReset();
    stopSpawnedDaemonMock.mockReset();
    dispatchMock.mockReset();
    appendLine.mockReset();
  });

  it('start ensures daemon is running and connects', async () => {
    ensureDaemonRunningMock.mockResolvedValue(undefined);
    const client = new DaemonClient({ appendLine });
    const connectAndRegisterSpy = vi
      .spyOn(client as any, 'connectAndRegister')
      .mockResolvedValue(undefined);

    await client.start();

    expect(ensureDaemonRunningMock).toHaveBeenCalledTimes(1);
    expect(connectAndRegisterSpy).toHaveBeenCalledTimes(1);
  });

  it('stop cleans reconnect timer and daemon connection', () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();
    const timer = setTimeout(() => undefined, 5_000);

    (client as any).daemonConnection = socket;
    (client as any).reconnectTimer = timer;
    (client as any).stopping = false;

    client.stop();

    expect((client as any).stopping).toBe(true);
    expect((client as any).reconnectTimer).toBeNull();
    expect((client as any).daemonConnection).toBeNull();
    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(stopSpawnedDaemonMock).toHaveBeenCalledTimes(1);
  });

  it('connectAndRegister sets handlers and schedules reconnect on close', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();
    const setupRequestHandlerSpy = vi.spyOn(client as any, 'setupRequestHandler');
    const scheduleReconnectSpy = vi.spyOn(client as any, 'scheduleReconnect').mockImplementation(() => undefined);
    vi.spyOn(client as any, 'openDaemonConnection').mockResolvedValue(socket);
    vi.spyOn(client as any, 'sendRegisterMessage').mockResolvedValue({
      type: 'register-ack',
      success: true,
    });

    await (client as any).connectAndRegister();
    socket.emit('close');

    expect((client as any).daemonConnection).toBe(socket);
    expect(setupRequestHandlerSpy).toHaveBeenCalledWith(socket);
    expect(scheduleReconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('connectAndRegister throws when registration fails', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();
    vi.spyOn(client as any, 'openDaemonConnection').mockResolvedValue(socket);
    vi.spyOn(client as any, 'sendRegisterMessage').mockResolvedValue({
      type: 'register-ack',
      success: false,
      error: 'nope',
    });

    await expect((client as any).connectAndRegister()).rejects.toThrow('Failed to register: nope');
  });

  it('sendRegisterMessage resolves with valid register-ack', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    const promise = (client as any).sendRegisterMessage(socket, {
      type: 'register',
      extensionId: 'id-1',
    });

    socket.emit('data', Buffer.from('{"type":"register-ack","success":true}\n'));

    await expect(promise).resolves.toEqual({
      type: 'register-ack',
      success: true,
    });
    expect(socket.setTimeout).toHaveBeenLastCalledWith(0);
  });

  it('sendRegisterMessage rejects on invalid register response', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    const promise = (client as any).sendRegisterMessage(socket, {
      type: 'register',
      extensionId: 'id-1',
    });

    socket.emit('data', Buffer.from('{"type":"register-ack","success":"yes"}\n'));

    await expect(promise).rejects.toThrow('Invalid register response');
  });

  it('sendRegisterMessage rejects on parse error', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    const promise = (client as any).sendRegisterMessage(socket, {
      type: 'register',
      extensionId: 'id-1',
    });

    socket.emit('data', Buffer.from('{bad-json}\n'));

    await expect(promise).rejects.toThrow('Failed to parse response');
  });

  it('sendRegisterMessage rejects on timeout event', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    const promise = (client as any).sendRegisterMessage(socket, {
      type: 'register',
      extensionId: 'id-1',
    });

    socket.emit('timeout');

    await expect(promise).rejects.toThrow('Request timeout');
  });

  it('setupRequestHandler processes newline-delimited requests', () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();
    const handleRequestSpy = vi.spyOn(client as any, 'handleRequest').mockResolvedValue(undefined);

    (client as any).setupRequestHandler(socket);
    socket.emit('data', Buffer.from('{"jsonrpc":"2.0","method":"ping","id":1}\n\n'));

    expect(handleRequestSpy).toHaveBeenCalledTimes(1);
  });

  it('handleRequest dispatches valid JSON-RPC request', async () => {
    dispatchMock.mockResolvedValue({ jsonrpc: '2.0', result: { ok: true }, id: 1 });
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    await (client as any).handleRequest('{"jsonrpc":"2.0","method":"ping","id":1}', socket);

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(socket.write).toHaveBeenCalledWith('{"jsonrpc":"2.0","result":{"ok":true},"id":1}\n');
  });

  it('handleRequest logs invalid JSON-RPC payload', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    await (client as any).handleRequest('{"foo":"bar"}', socket);

    expect(socket.write).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(
      '[multi-vscode-remote-control] Invalid JSON-RPC request: {"foo":"bar"}',
    );
  });

  it('handleRequest logs parse failures', async () => {
    const client = new DaemonClient({ appendLine });
    const socket = new MockSocket();

    await (client as any).handleRequest('{not-json}', socket);

    expect(appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[multi-vscode-remote-control] Failed to handle request:'),
    );
  });
});
