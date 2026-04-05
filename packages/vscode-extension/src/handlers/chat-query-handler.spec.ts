import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

const { cancelMock, disposeMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  disposeMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  lm: {
    selectChatModels: vi.fn(),
  },
  LanguageModelChatMessage: {
    User: vi.fn((text: string) => ({ role: 'user', text })),
  },
  CancellationTokenSource: class {
    token = { isCancellationRequested: false };
    cancel = cancelMock;
    dispose = disposeMock;
  },
  LanguageModelError: class LanguageModelError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
      this.name = 'LanguageModelError';
    }
  },
}));

import { handleChatQuery } from './chat-query-handler.js';
import type { JsonRpcRequest } from '../types.js';

describe('handleChatQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelMock.mockReset();
    disposeMock.mockReset();
  });

  it('returns collected response when valid params', async () => {
    vi.mocked(vscode.lm.selectChatModels)
      .mockResolvedValueOnce([{ id: 'catalog-model' } as any])
      .mockResolvedValueOnce([
        {
          id: 'gpt-5-mini-primary',
          sendRequest: vi.fn().mockResolvedValue({
            text: {
              async *[Symbol.asyncIterator]() {
                yield 'Hello ';
                yield 'World';
              },
            },
          }),
        } as any,
      ]);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.query',
      id: 1,
      params: {
        prompt: 'Say hello',
        timeout: 1000,
      },
    };

    const response = await handleChatQuery(request);

    expect(vscode.lm.selectChatModels).toHaveBeenCalledTimes(2);
    expect(vscode.LanguageModelChatMessage.User).toHaveBeenCalledWith('Say hello');
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        response: 'Hello World',
        model: 'gpt-5-mini-primary',
      },
      id: 1,
    });
  });

  it('returns invalid params error when prompt is missing', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.query',
      id: 2,
      params: {},
    };

    const response = await handleChatQuery(request);

    expect(vscode.lm.selectChatModels).not.toHaveBeenCalled();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe('Invalid params: prompt is required');
    expect(response.id).toBe(2);
  });

  it('returns model unavailable error when no models are selected', async () => {
    vi.mocked(vscode.lm.selectChatModels)
      .mockResolvedValueOnce([{ id: 'catalog-model' } as any])
      .mockResolvedValueOnce([]);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.query',
      id: 3,
      params: {
        prompt: 'No model test',
      },
    };

    const response = await handleChatQuery(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'No language models available. Make sure Copilot is installed and you are signed in.',
      },
      id: 3,
    });
  });

  it('returns language model error details when sendRequest throws LanguageModelError', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new vscode.LanguageModelError('Quota exceeded', 'quota_exceeded'));

    vi.mocked(vscode.lm.selectChatModels)
      .mockResolvedValueOnce([{ id: 'catalog-model' } as any])
      .mockResolvedValueOnce([
        {
          id: 'gpt-5-mini-primary',
          sendRequest,
        } as any,
      ]);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.query',
      id: 4,
      params: {
        prompt: 'Trigger lm error',
      },
    };

    const response = await handleChatQuery(request);

    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Language model error: Quota exceeded',
        data: {
          code: 'quota_exceeded',
        },
      },
      id: 4,
    });
  });

  it('returns internal error when sendRequest throws generic error', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error('Network down'));

    vi.mocked(vscode.lm.selectChatModels)
      .mockResolvedValueOnce([{ id: 'catalog-model' } as any])
      .mockResolvedValueOnce([
        {
          id: 'gpt-5-mini-primary',
          sendRequest,
        } as any,
      ]);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.query',
      id: 5,
      params: {
        prompt: 'Trigger generic error',
      },
    };

    const response = await handleChatQuery(request);

    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to query language model: Network down',
      },
      id: 5,
    });
  });
});
