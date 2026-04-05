import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { handleChatSend } from './chat-send-handler.js';
import type { JsonRpcRequest } from '../types.js';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('handleChatSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error for missing prompt', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: {},
      id: 1,
    };

    const response = await handleChatSend(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32602,
        message: 'Invalid params',
        data: { reason: 'prompt is required' },
      },
      id: 1,
    });
  });

  it('sends prompt without sync option (default)', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { prompt: 'Hello' },
      id: 1,
    };

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

    const response = await handleChatSend(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      { query: 'Hello', blockOnResponse: false }
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Prompt sent to chat',
      },
      id: 1,
    });
  });

  it('sends prompt with sync: false', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { prompt: 'Hello', sync: false },
      id: 1,
    };

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

    const response = await handleChatSend(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      { query: 'Hello', blockOnResponse: false }
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Prompt sent to chat',
      },
      id: 1,
    });
  });

  it('sends prompt with sync: true', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { prompt: 'Hello', sync: true },
      id: 1,
    };

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({});

    const response = await handleChatSend(request);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.action.chat.open',
      { query: 'Hello', blockOnResponse: true }
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Prompt sent and response completed',
      },
      id: 1,
    });
  });

  it('includes errorDetails in response when sync: true and error occurs', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { prompt: 'Hello', sync: true },
      id: 1,
    };

    const errorResult = {
      errorDetails: {
        code: 'TEST_ERROR',
        message: 'Test error message',
      },
    };

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(errorResult);

    const response = await handleChatSend(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        success: true,
        message: 'Prompt sent and response completed',
        response: {
          errorDetails: {
            code: 'TEST_ERROR',
            message: 'Test error message',
          },
        },
      },
      id: 1,
    });
  });

  it('handles command execution error', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.send',
      params: { prompt: 'Hello' },
      id: 1,
    };

    vi.mocked(vscode.commands.executeCommand).mockRejectedValue(
      new Error('Command failed')
    );

    const response = await handleChatSend(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: { reason: 'Error: Command failed' },
      },
      id: 1,
    });
  });
});
