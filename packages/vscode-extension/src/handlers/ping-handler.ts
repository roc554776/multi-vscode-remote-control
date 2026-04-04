import type { JsonRpcResponse } from '../types.js';

export function handlePing(id: string | number | null): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    result: {
      message: 'pong',
      timestamp: Date.now(),
    },
    id,
  };
}
