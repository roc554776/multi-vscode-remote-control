import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { TabsListParamsSchema, JSON_RPC_ERRORS } from '../types.js';
import { TabManager } from '../tab-manager.js';

const tabManager = new TabManager();

export function handleTabsList(request: JsonRpcRequest): JsonRpcResponse {
  const parseResult = TabsListParamsSchema.safeParse(request.params);
  
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

  const result = tabManager.listTabs();

  return {
    jsonrpc: '2.0',
    result,
    id: request.id ?? null,
  };
}
