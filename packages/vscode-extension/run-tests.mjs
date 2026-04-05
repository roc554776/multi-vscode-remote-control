import { runTests } from '@vscode/test-electron';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const testSocketDir = join(homedir(), '.multi-vscode-remote-control');
  if (!existsSync(testSocketDir)) {
    mkdirSync(testSocketDir, { recursive: true, mode: 0o700 });
  }
  const testSocketPath = join(
    testSocketDir,
    `test-daemon-${Date.now().toString()}-${process.pid.toString()}.sock`,
  );

  process.env.MULTI_VSCODE_SOCKET_PATH = testSocketPath;
  process.env.MULTI_VSCODE_DAEMON_DETACHED = '0';

  try {
    const extensionDevelopmentPath = resolve(__dirname);
    const extensionTestsPath = resolve(__dirname, './dist/test/suite/index.mjs');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions',
        '--disable-gpu',
      ],
      extensionTestsEnv: {
        MULTI_VSCODE_SOCKET_PATH: testSocketPath,
        MULTI_VSCODE_DAEMON_DETACHED: '0',
      },
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  } finally {
    try {
      if (existsSync(testSocketPath)) {
        rmSync(testSocketPath, { force: true });
      }
    } catch (err) {
      console.warn(`Failed to cleanup test socket: ${String(err)}`);
    }
  }
}

main();
