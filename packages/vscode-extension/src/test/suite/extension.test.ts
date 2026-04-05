import * as assert from 'assert';

describe('Multi VSCode Remote Control Integration Tests', () => {
  it('should pass basic assertion', () => {
    assert.ok(true);
  });

  it('should find extension', async () => {
    const vscode = await import('vscode');
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext, 'Extension should be found');
  });

  it('should activate extension on startup', async function() {
    this.timeout(5000);
    
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });

    const vscode = await import('vscode');
    const ext = vscode.extensions.getExtension('roc.multi-vscode-remote-control');
    assert.ok(ext?.isActive, 'Extension should be active');
  });
});

