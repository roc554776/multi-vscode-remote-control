import * as vscode from 'vscode';
import { z } from 'zod';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { JSON_RPC_ERRORS } from '../types.js';

const FileOpenParamsSchema = z.object({
  path: z.string(),
  viewColumn: z.number().optional(),
  preserveFocus: z.boolean().optional(),
  preview: z.boolean().optional(),
});

/**
 * Open a file in VSCode editor.
 * This handler properly constructs a vscode.Uri from the file path.
 */
export async function handleFileOpen(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const parseResult = FileOpenParamsSchema.safeParse(request.params);

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

  const { path, viewColumn, preserveFocus, preview } = parseResult.data;

  try {
    const uri = vscode.Uri.file(path);
    const options: vscode.TextDocumentShowOptions = {};
    
    if (viewColumn !== undefined) {
      options.viewColumn = viewColumn;
    }
    if (preserveFocus !== undefined) {
      options.preserveFocus = preserveFocus;
    }
    if (preview !== undefined) {
      options.preview = preview;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, options);

    return {
      jsonrpc: '2.0',
      result: {
        opened: true,
        path,
        uri: uri.toString(),
      },
      id: request.id ?? null,
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
      },
      id: request.id ?? null,
    };
  }
}
