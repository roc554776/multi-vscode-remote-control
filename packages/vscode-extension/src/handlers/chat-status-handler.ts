import * as vscode from 'vscode';
import type { JsonRpcRequest, JsonRpcResponse, ChatStatusResult } from '../types.js';
import { JSON_RPC_ERRORS } from '../types.js';

function isChatTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  if (!(input instanceof vscode.TabInputWebview)) {
    return false;
  }

  // Copilot Chat panel is represented as a webview tab.
  // We use a broad match to be resilient to VSCode/internal naming changes.
  return input.viewType.includes('chat');
}

export async function handleChatStatus(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = request.id ?? null;

  try {
    let open = false;
    let focused = false;

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!isChatTab(tab)) {
          continue;
        }

        open = true;
        if (group.isActive && tab.isActive) {
          focused = true;
        }
      }
    }

    // Note: VSCode's public API does not expose the chat model's internal state
    // (e.g., IChatModel.requestInProgress). The busy state detection would require:
    // - DOM inspection via DevTools protocol (not available in extensions)
    // - Internal API access (not stable/public)
    //
    // Workaround: Use chat.send with { sync: true } to wait for response completion
    // instead of polling chat.status for busy state.
    const result: ChatStatusResult = {
      open,
      focused,
      busy: null,
    };

    return {
      jsonrpc: '2.0',
      result,
      id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      jsonrpc: '2.0',
      error: {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR.code,
        message: `Failed to get chat status: ${message}`,
      },
      id,
    };
  }
}
