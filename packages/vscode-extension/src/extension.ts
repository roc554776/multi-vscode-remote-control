import * as vscode from 'vscode';
import { DaemonClient } from './daemon-client.js';

let client: DaemonClient | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('VCC Remote Control');
  outputChannel.appendLine('multi-vscode-remote-control extension activated');

  // Don't start daemon in test mode
  if (context.extensionMode === vscode.ExtensionMode.Test) {
    outputChannel.appendLine('Running in test mode - daemon client not started');
    return;
  }

  client = new DaemonClient(outputChannel);
  void client.start().catch((err: unknown) => {
    outputChannel.appendLine(`Failed to start daemon client: ${String(err)}`);
  });

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        client.stop();
        client = null;
      }
    },
  });
}

export function deactivate(): void {
  if (client) {
    client.stop();
    client = null;
  }
}
