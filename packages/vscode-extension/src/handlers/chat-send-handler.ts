import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse, ChatSendResult } from '../types.js';
import { ChatSendParamsSchema, JSON_RPC_ERRORS } from '../types.js';

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

    if (sync && commandResult) {
      const agentResult = commandResult as {
        errorDetails?: {
          code?: string;
          message?: string;
        };
      };
      if (agentResult.errorDetails) {
        result.response = {
          errorDetails: agentResult.errorDetails,
        };
      }
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
