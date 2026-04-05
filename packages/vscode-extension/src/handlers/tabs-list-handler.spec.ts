import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listTabsMock } = vi.hoisted(() => ({
  listTabsMock: vi.fn(),
}));

vi.mock('../tab-manager.js', () => ({
  TabManager: class {
    listTabs = listTabsMock;
  },
}));

import { handleTabsList } from './tabs-list-handler.js';
import type { JsonRpcRequest } from '../types.js';

describe('handleTabsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTabsMock.mockReset();
  });

  it('returns tab list on valid params', () => {
    listTabsMock.mockReturnValue({
      tabs: [
        {
          uri: 'file:///workspace/a.ts',
          label: 'a.ts',
          isActive: true,
          isDirty: false,
          groupIndex: 0,
          index: 0,
        },
      ],
      activeTabUri: 'file:///workspace/a.ts',
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.list',
      params: {},
      id: 1,
    };

    const response = handleTabsList(request);

    expect(listTabsMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        tabs: [
          {
            uri: 'file:///workspace/a.ts',
            label: 'a.ts',
            isActive: true,
            isDirty: false,
            groupIndex: 0,
            index: 0,
          },
        ],
        activeTabUri: 'file:///workspace/a.ts',
      },
      id: 1,
    });
  });

  it('returns invalid params error for invalid params', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.list',
      params: { includeGroupInfo: 'yes' as unknown as boolean },
      id: 2,
    };

    const response = handleTabsList(request);

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe('Invalid params');
    expect(response.id).toBe(2);
  });

  it('throws when tab manager fails', () => {
    listTabsMock.mockImplementation(() => {
      throw new Error('tab manager failed');
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tabs.list',
      params: {},
      id: 3,
    };

    expect(() => handleTabsList(request)).toThrow('tab manager failed');
  });
});
