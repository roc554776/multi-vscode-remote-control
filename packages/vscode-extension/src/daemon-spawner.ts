import { spawn, type ChildProcess } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDaemonSocketPath } from './daemon-socket-path.js';

export class DaemonSpawner {
  private socketPath: string;
  private daemonPath: string;
  private spawnedProcess: ChildProcess | null = null;
  private spawnedByThisProcess = false;

  constructor() {
    this.socketPath = getDaemonSocketPath();

    // daemon の実行ファイルのパスを解決
    // 開発時とパッケージ時で異なる可能性があるため、複数のパスを試す
    const candidates = [
      // VSCode extension からの相対パス（開発時）
      path.resolve(__dirname, '../../daemon/dist/index.js'),
      // VSIX 同梱 daemon（dist/daemon/dist/index.js）
      path.resolve(__dirname, '../daemon/dist/index.js'),
      // VSCode extension からの相対パス（パッケージ時）
      path.resolve(__dirname, '../../../daemon/dist/index.js'),
      // グローバルインストール
      'multi-vscode-daemon',
    ];

    this.daemonPath = candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
    
    if (!this.daemonPath) {
      throw new Error('Could not find daemon executable');
    }
  }

  /**
   * daemon socket への接続を試みる
   */
  private async connectToSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('Socket connection timeout'));
      });

      socket.connect(this.socketPath);
    });
  }

  /**
   * Test if daemon is running by attempting to connect to the socket
   */
  async isDaemonRunning(): Promise<boolean> {
    try {
      await this.connectToSocket();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure daemon is running. Spawn if not running.
   */
  async ensureDaemonRunning(log: (message: string) => void): Promise<void> {
    const running = await this.isDaemonRunning();
    
    if (running) {
      log('Daemon is already running');
      return;
    }

    log(`Spawning daemon: ${this.daemonPath}`);
    this.spawn(log);

    // Wait for daemon to be ready (max 5 seconds)
    const maxWait = 5000;
    const interval = 100;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      elapsed += interval;

      const ready = await this.isDaemonRunning();
      if (ready) {
        log('Daemon is ready');
        return;
      }
    }

    throw new Error('Daemon failed to start within 5 seconds');
  }

  private spawn(log: (message: string) => void): ChildProcess {
    try {
      const detached = process.env.MULTI_VSCODE_DAEMON_DETACHED !== '0';
      const child = spawn('node', [this.daemonPath], {
        detached,
        stdio: 'ignore',
        env: {
          ...process.env,
          MULTI_VSCODE_SOCKET_PATH: this.socketPath,
        },
      });

      if (detached) {
        child.unref();
      } else {
        this.spawnedProcess = child;
        this.spawnedByThisProcess = true;
      }

      log('Daemon spawn initiated');
      return child;
    } catch (err) {
      log(`Failed to spawn daemon: ${String(err)}`);
      throw err;
    }
  }

  stopSpawnedDaemon(log: (message: string) => void): void {
    if (!this.spawnedByThisProcess || !this.spawnedProcess) {
      return;
    }

    const pid = this.spawnedProcess.pid;
    if (!pid) {
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      log(`Stopped spawned daemon (pid: ${pid.toString()})`);
    } catch (err) {
      log(`Failed to stop spawned daemon: ${String(err)}`);
    } finally {
      this.spawnedProcess = null;
      this.spawnedByThisProcess = false;
    }
  }
}
