import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { handleChatNewSession } from './chat-new-session-handler.js';
import type { JsonRpcRequest } from '../types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('handleChatNewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls new chat session command and returns success response', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined as any);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.newSession',
      id: 1,
    };

    const response = await handleChatNewSession(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.newChat');
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
      method: 'chat.newSession',
      id: 2,
    };

    const response = await handleChatNewSession(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.chat.newChat');
    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to start new chat session: Command failed',
      },
      id: 2,
    });
  });
});
