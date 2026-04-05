import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { CommandExecuteParamsSchema, JSON_RPC_ERRORS } from '../types.js';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Commands that require the first argument to be a vscode.Uri
 */
const URI_COMMANDS = [
  'vscode.open',
  'vscode.openFolder',
  'markdown.showPreview',
  'markdown.showPreviewToSide',
];

/**
 * Check if a string appears to be a URI with a scheme (e.g., file://, untitled:, vscode-remote:)
 */
export function hasUriScheme(str: string): boolean {
  // Avoid treating Windows drive-letter paths (e.g., C:\foo or C:/foo) as URI schemes
  if (/^[a-z]:[\\/]/i.test(str)) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(str);
}

/**
 * Convert first argument to vscode.Uri for commands that require it.
 * - If the first argument already has a scheme (file://, untitled:, etc.), use Uri.parse()
 * - Otherwise, treat it as a file path and use Uri.file()
 */
export function convertArgsForCommand(command: string, args: unknown[]): unknown[] {
  if (!URI_COMMANDS.includes(command)) {
    return args;
  }

  if (args.length === 0 || typeof args[0] !== 'string') {
    return args;
  }

  const firstArg = args[0];
  const convertedUri = hasUriScheme(firstArg)
    ? vscode.Uri.parse(firstArg)
    : vscode.Uri.file(firstArg);

  return [convertedUri, ...args.slice(1)];
}

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

  // Convert first argument to vscode.Uri for commands that require it
  const processedArgs = convertArgsForCommand(command, args);

  try {
    const commandPromise = vscode.commands.executeCommand(command, ...processedArgs);

    // Race between the command execution and a timeout
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      setTimeout(() => {
        resolve({ timedOut: true });
      }, timeoutMs);
    });

    const result = await Promise.race([
      commandPromise.then(
        (value) => ({ timedOut: false as const, value }),
        (error: unknown) => ({ timedOut: false as const, error: error instanceof Error ? error.message : String(error) }),
      ),
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

    if ('error' in result) {
      return {
        jsonrpc: '2.0',
        error: {
          ...JSON_RPC_ERRORS.INTERNAL_ERROR,
          message: `Command failed: ${result.error}`,
        },
        id: request.id ?? null,
      };
    }

    return {
      jsonrpc: '2.0',
      result: result.value,
      id: request.id ?? null,
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      },
      id: request.id ?? null,
    };
  }
}
