import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { CommandExecuteParamsSchema, JSON_RPC_ERRORS } from '../types.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Execute a VSCode command with a timeout.
 * Some commands (like vscode.open) don't return a result and may hang indefinitely.
 * The timeout ensures we return a response even if the command doesn't resolve.
 */
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

  const { command, args, timeout } = parseResult.data;
  const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

  const commandPromise = vscode.commands.executeCommand(command, ...args);

  // Race between the command execution and a timeout
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  const result = await Promise.race([
    commandPromise.then((value) => ({ timedOut: false as const, value })),
    timeoutPromise,
  ]);

  if (result.timedOut) {
    // Command didn't complete within timeout, but it was likely dispatched successfully
    return {
      jsonrpc: '2.0',
      result: { dispatched: true, command, message: 'Command dispatched (no response within timeout)' },
      id: request.id ?? null,
    };
  }

  return {
    jsonrpc: '2.0',
    result: result.value,
    id: request.id ?? null,
  };
}
