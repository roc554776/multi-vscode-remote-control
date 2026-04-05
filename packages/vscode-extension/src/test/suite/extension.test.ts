import { describe, it } from 'node:test';
import { expect } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

void describe('Multi VSCode Remote Control E2E Tests', () => {
  void it('should find extension', () => {
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    expect(ext).toBeDefined();
  });

  void it('should activate extension on startup', async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });

    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    expect(ext?.isActive).toBe(true);
  });

  void it('should create daemon socket', async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 5000);
    });

    const socketPath = path.join(os.homedir(), '.multi-vscode-remote-control', 'daemon.sock');
    const exists = fs.existsSync(socketPath);
    expect(exists).toBe(true);
  });
});
