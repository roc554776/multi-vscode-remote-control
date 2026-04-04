import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { JSON_RPC_ERRORS } from '../types.js';
import { handlePing } from './ping-handler.js';
import { handleTabsList } from './tabs-list-handler.js';
import { handleTabsClose } from './tabs-close-handler.js';

type Handler = (request: JsonRpcRequest) => JsonRpcResponse | Promise<JsonRpcResponse>;

const handlers: Record<string, Handler> = {
  ping: (req) => handlePing(req.id ?? null),
  'tabs.list': handleTabsList,
  'tabs.close': handleTabsClose,
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
