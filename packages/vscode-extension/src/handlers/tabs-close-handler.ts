import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { TabsCloseParamsSchema, JSON_RPC_ERRORS } from '../types.js';
import { TabManager } from '../tab-manager.js';

const tabManager = new TabManager();

export async function handleTabsClose(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const parseResult = TabsCloseParamsSchema.safeParse(request.params);
  
  if (!parseResult.success) {
    return {
      jsonrpc: '2.0',
      error: {
        ...JSON_RPC_ERRORS.INVALID_PARAMS,
        data: { reason: 'uri is required' },
      },
      id: request.id ?? null,
    };
  }

  const { uri, save } = parseResult.data;
  const result = await tabManager.closeTab(uri, save);

  return {
    jsonrpc: '2.0',
    result,
    id: request.id ?? null,
  };
}
