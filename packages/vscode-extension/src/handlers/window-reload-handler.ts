import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';

export async function handleWindowReload(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const result = await vscode.commands.executeCommand('workbench.action.reloadWindow');

  return {
    jsonrpc: '2.0',
    result,
    id: request.id ?? null,
  };
}
