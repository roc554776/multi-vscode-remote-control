import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { CommandExecuteParamsSchema, JSON_RPC_ERRORS } from '../types.js';

export async function handleCommandExecute(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const parseResult = CommandExecuteParamsSchema.safeParse(request.params);

  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INVALID_PARAMS,
        data: { errors: parseResult.error.errors },
      },
      id: request.id ?? null,
    };
  }

  const { command, args } = parseResult.data;
  const result = await vscode.commands.executeCommand(command, ...args);

  return {
    jsonrpc: '2.0',
    result,
    id: request.id ?? null,
  };
}
