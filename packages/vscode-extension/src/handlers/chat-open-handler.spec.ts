import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { handleChatOpen } from './chat-open-handler.js';
import type { JsonRpcRequest } from '../types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('handleChatOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls chat open command and returns success response', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.open',
      id: 1,
    };

    const response = await handleChatOpen(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open');
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        success: true,
      },
      id: 1,
    });
  });

  it('returns error when command fails', async () => {
    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('Command failed'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.open',
      id: 2,
    };

    const response = await handleChatOpen(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.open');
    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to open chat panel: Command failed',
      },
      id: 2,
    });
  });
});
