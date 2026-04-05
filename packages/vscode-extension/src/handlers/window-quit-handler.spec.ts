import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { handleWindowQuit } from './window-quit-handler.js';
import type { JsonRpcRequest } from '../types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('handleWindowQuit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes quit command and returns result', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.quit',
      params: {},
      id: 1,
    };

    const response = await handleWindowQuit(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.quit');
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
      method: 'window.quit',
      params: {},
    };

    const response = await handleWindowQuit(request);

    expect(response.id).toBeNull();
    expect(response.result).toBe('ok');
  });

  it('propagates command errors', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('quit failed'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.quit',
      params: {},
      id: 3,
    };

    await expect(handleWindowQuit(request)).rejects.toThrow('quit failed');
  });
});
