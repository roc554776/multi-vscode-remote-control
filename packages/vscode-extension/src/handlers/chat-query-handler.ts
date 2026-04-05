import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse, ChatQueryResult } from '../types.js';
import { ChatQueryParamsSchema, JSON_RPC_ERRORS } from '../types.js';

export async function handleChatQuery(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  const parseResult = ChatQueryParamsSchema.safeParse(request.params);
  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_ERRORS.INVALID_PARAMS.code,
        message: 'Invalid params: prompt is required',
        data: parseResult.error.format(),
      },
      id,
    };
  }

  const { prompt, timeout } = parseResult.data;

  try {
    await vscode.lm.selectChatModels({ vendor: 'copilot' });

    const models = await vscode.lm.selectChatModels({
      vendor: 'copilot',
      family: 'gpt-5-mini',
    });

    if (models.length === 0) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'No language models available. Make sure Copilot is installed and you are signed in.',
        },
        id,
      };
    }

    const selectedModel = models[0];
    if (!selectedModel) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'No language models available. Make sure Copilot is installed and you are signed in.',
        },
        id,
      };
    }

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const tokenSource = new vscode.CancellationTokenSource();
    const timeoutId = setTimeout(() => tokenSource.cancel(), timeout);

    try {
      const chatResponse = await selectedModel.sendRequest(
        messages,
        {
          modelOptions: {
            reasoning_effort: 'high',
          },
        },
        tokenSource.token
      );

      let responseText = '';
      for await (const fragment of chatResponse.text) {
        responseText += fragment;
      }

      const result: ChatQueryResult = {
        response: responseText,
        model: selectedModel.id,
      };

      return {
        jsonrpc: '2.0',
        result,
        id,
      };
    } finally {
      clearTimeout(timeoutId);
      tokenSource.dispose();
    }
  } catch (error) {
    if (error instanceof vscode.LanguageModelError) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: `Language model error: ${error.message}`,
          data: { code: error.code },
        },
        id,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR.code,
        message: `Failed to query language model: ${message}`,
      },
      id,
    };
  }
}
