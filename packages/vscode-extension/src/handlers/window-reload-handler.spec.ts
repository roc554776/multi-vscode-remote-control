import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { handleWindowReload } from './window-reload-handler.js';
import type { JsonRpcRequest } from '../types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('handleWindowReload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes reload command and returns result', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.reload',
      params: {},
      id: 1,
    };

    const response = await handleWindowReload(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: undefined,
      id: 1,
    });
  });

  it('uses null id when missing', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue('ok');

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.reload',
      params: {},
    };

    const response = await handleWindowReload(request);

    expect(response.id).toBeNull();
    expect(response.result).toBe('ok');
  });

  it('propagates command errors', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('reload failed'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.reload',
      params: {},
      id: 3,
    };

    await expect(handleWindowReload(request)).rejects.toThrow('reload failed');
  });
});
