import { DaemonServer } from './daemon-server.js';

async function main(): Promise<void> {
  const daemon = new DaemonServer();

  // シグナルハンドラを設定
  const shutdown = (): void => {
    console.log('Shutting down daemon...');
    daemon.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await daemon.start();
}

void main();
