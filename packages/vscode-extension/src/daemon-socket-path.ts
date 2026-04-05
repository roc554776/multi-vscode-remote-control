import * as os from 'node:os';
import * as path from 'node:path';

const SOCKET_PATH_ENV_NAME = 'MULTI_VSCODE_SOCKET_PATH';

export function getDaemonSocketPath(): string {
  const envPath = process.env[SOCKET_PATH_ENV_NAME]?.trim();
  if (envPath) {
    return envPath;
  }

  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\multi-vscode-daemon';
  }

  const dir = path.join(os.homedir(), '.multi-vscode-remote-control');
  return path.join(dir, 'daemon.sock');
}
