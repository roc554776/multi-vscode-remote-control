import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

suite('Multi VSCode Remote Control E2E Tests', () => {
  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext, 'Extension should be found');
  });

  test('Extension should activate on startup', async function () {
    this.timeout(10000);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext?.isActive, 'Extension should be active');
  });

  test('Daemon socket should be created', async function () {
    this.timeout(15000);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const socketPath = path.join(os.homedir(), '.multi-vscode-remote-control', 'daemon.sock');
    const exists = fs.existsSync(socketPath);
    assert.ok(exists, `Socket should exist at ${socketPath}`);
  });
});
