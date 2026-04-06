import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse, ChatSendResult } from '../types.js';
import { ChatSendParamsSchema, JSON_RPC_ERRORS } from '../types.js';

type ChatSendCommandResult = {
  errorDetails?: {
    code?: string;
    message?: string;
  };
};

function hasErrorDetails(value: unknown): value is ChatSendCommandResult {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, 'errorDetails');
}

export async function handleChatSend(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const parseResult = ChatSendParamsSchema.safeParse(request.params);
  
  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INVALID_PARAMS,
        data: { reason: 'prompt is required' },
      },
      id: request.id ?? null,
    };
  }

  const { prompt, sync } = parseResult.data;

  try {
    const commandResult = await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      blockOnResponse: sync,
    });

    const result: ChatSendResult = {
      success: true,
      message: sync ? 'Prompt sent and response completed' : 'Prompt sent to chat',
    };

    if (sync && hasErrorDetails(commandResult) && commandResult.errorDetails) {
        result.response = {
          errorDetails: commandResult.errorDetails,
        };
    }

    return {
      jsonrpc: '2.0',
      result,
      id: request.id ?? null,
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INTERNAL_ERROR,
        data: { reason: String(error) },
      },
      id: request.id ?? null,
    };
  }
}
