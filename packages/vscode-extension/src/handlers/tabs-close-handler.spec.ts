import { beforeEach, describe, expect, it, vi } from 'vitest';

const { closeTabMock } = vi.hoisted(() => ({
  closeTabMock: vi.fn(),
}));

vi.mock('../tab-manager.js', () => ({
  TabManager: class {
    closeTab = closeTabMock;
  },
}));

import { handleTabsClose } from './tabs-close-handler.js';
import type { JsonRpcRequest } from '../types.js';

describe('handleTabsClose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeTabMock.mockReset();
  });

  it('closes tab on valid params', async () => {
    closeTabMock.mockResolvedValue({ success: true, closed: true });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.close',
      params: { uri: 'file:///workspace/a.ts', save: true },
      id: 1,
    };

    const response = await handleTabsClose(request);

    expect(closeTabMock).toHaveBeenCalledWith('file:///workspace/a.ts', true);
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: { success: true, closed: true },
      id: 1,
    });
  });

  it('returns invalid params error when uri is missing', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.close',
      params: {},
      id: 2,
    };

    const response = await handleTabsClose(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32602,
        message: 'Invalid params',
        data: { reason: 'uri is required' },
      },
      id: 2,
    });
  });

  it('propagates errors from tab manager', async () => {
    closeTabMock.mockRejectedValue(new Error('close failed'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.close',
      params: { uri: 'file:///workspace/a.ts' },
      id: 3,
    };

    await expect(handleTabsClose(request)).rejects.toThrow('close failed');
  });
});
