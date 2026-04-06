import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getDaemonSocketPath } from './daemon-socket-path.js';

const originalPlatform = process.platform;

describe('getDaemonSocketPath', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MULTI_VSCODE_SOCKET_PATH;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('returns trimmed value from environment variable when set', () => {
    process.env.MULTI_VSCODE_SOCKET_PATH = '  /tmp/custom.sock  ';

    expect(getDaemonSocketPath()).toBe('/tmp/custom.sock');
  });

  it('returns windows named pipe path on win32 platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    expect(getDaemonSocketPath()).toBe('\\\\.\\pipe\\multi-vscode-daemon');
  });

  it('returns homedir based unix socket path on non-windows platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    const expected = path.join(os.homedir(), '.multi-vscode-remote-control', 'daemon.sock');
    expect(getDaemonSocketPath()).toBe(expected);
  });
});
