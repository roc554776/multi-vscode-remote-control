import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client.js';

let client: DaemonClient | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('VCC Remote Control');
  outputChannel.appendLine('multi-vscode-remote-control extension activated');

  client = new DaemonClient(outputChannel);
  void client.start().catch((err) => {
    outputChannel.appendLine(`Failed to start daemon client: ${String(err)}`);
  });

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        void client.stop();
        client = null;
      }
    },
  });
}

export function deactivate(): void {
  if (client) {
    void client.stop();
    client = null;
  }
}
