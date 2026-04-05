import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';

export async function handleWindowQuit(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const result = await vscode.commands.executeCommand('workbench.action.quit');

  return {
    jsonrpc: '2.0',
    result,
    id: request.id ?? null,
  };
}
