import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { JSON_RPC_ERRORS } from '../types.js';

export async function handleChatOpen(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  try {
    await vscode.commands.executeCommand('workbench.action.chat.open');
    return {
      jsonrpc: '2.0',
      result: {
        success: true,
      },
      id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR.code,
        message: `Failed to open chat panel: ${message}`,
      },
      id,
    };
  }
}
