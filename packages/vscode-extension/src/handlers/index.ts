import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { JSON_RPC_ERRORS } from '../types.js';
import { handlePing } from './ping-handler.js';
import { handleTabsList } from './tabs-list-handler.js';
import { handleTabsClose } from './tabs-close-handler.js';
import { handleCommandExecute } from './command-execute-handler.js';
import { handleWindowReload } from './window-reload-handler.js';
import { handleWindowQuit } from './window-quit-handler.js';
import { handleFileOpen } from './file-open-handler.js';
import { handleChatSend } from './chat-send-handler.js';
import { handleChatOpen } from './chat-open-handler.js';
import { handleChatQuery } from './chat-query-handler.js';

type Handler = (request: JsonRpcRequest) => JsonRpcResponse | Promise<JsonRpcResponse>;

const handlers: Record<string, Handler> = {
  ping: (req) => handlePing(req.id ?? null),
  'tabs.list': handleTabsList,
  'tabs.close': handleTabsClose,
  'command.execute': handleCommandExecute,
  'window.reload': handleWindowReload,
  'window.quit': handleWindowQuit,
  'file.open': handleFileOpen,
  'chat.open': handleChatOpen,
  'chat.send': handleChatSend,
  'chat.query': handleChatQuery,
};

export function dispatch(request: JsonRpcRequest): JsonRpcResponse | Promise<JsonRpcResponse> {
  const handler = handlers[request.method];

  if (!handler) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        data: { method: request.method },
      },
      id: request.id ?? null,
    };
  }

  return handler(request);
}
