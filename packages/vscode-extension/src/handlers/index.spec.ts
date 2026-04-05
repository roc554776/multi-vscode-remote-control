import { describe, expect, it, vi } from 'vitest';
import type { JsonRpcRequest } from '../types.js';

vi.mock('./ping-handler.js', () => ({
  handlePing: vi.fn((id) => ({ jsonrpc: '2.0', result: { message: 'pong' }, id })),
}));

vi.mock('./tabs-list-handler.js', () => ({
  handleTabsList: vi.fn(() => ({ jsonrpc: '2.0', result: { tabs: [], activeTabUri: null }, id: 1 })),
}));

vi.mock('./tabs-close-handler.js', () => ({
  handleTabsClose: vi.fn(async () => ({ jsonrpc: '2.0', result: { success: true, closed: true }, id: 1 })),
}));

vi.mock('./command-execute-handler.js', () => ({
  handleCommandExecute: vi.fn(async () => ({ jsonrpc: '2.0', result: { ok: true }, id: 1 })),
}));

vi.mock('./window-reload-handler.js', () => ({
  handleWindowReload: vi.fn(async () => ({ jsonrpc: '2.0', result: undefined, id: 1 })),
}));

vi.mock('./window-quit-handler.js', () => ({
  handleWindowQuit: vi.fn(async () => ({ jsonrpc: '2.0', result: undefined, id: 1 })),
}));

vi.mock('./file-open-handler.js', () => ({
  handleFileOpen: vi.fn(async () => ({ jsonrpc: '2.0', result: { opened: true }, id: 1 })),
}));

vi.mock('./chat-send-handler.js', () => ({
  handleChatSend: vi.fn(async () => ({ jsonrpc: '2.0', result: { success: true }, id: 1 })),
}));

vi.mock('./chat-new-session-handler.js', () => ({
  handleChatNewSession: vi.fn(async () => ({ jsonrpc: '2.0', result: { success: true }, id: 1 })),
}));

import { dispatch } from './index.js';

describe('dispatch', () => {
  it('dispatches ping request', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'ping',
      id: 1,
    };

    const response = dispatch(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: { message: 'pong' },
      id: 1,
    });
  });

  it('dispatches async handler request', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'window.reload',
      id: 2,
    };

    const response = await dispatch(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: undefined,
      id: 1,
    });
  });

  it('dispatches chat.newSession request', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.newSession',
      id: 3,
    };

    const response = await dispatch(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: { success: true },
      id: 1,
    });
  });

  it('returns method not found for unknown method', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'unknown.method',
      id: 'x',
    };

    const response = dispatch(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: 'Method not found',
        data: { method: 'unknown.method' },
      },
      id: 'x',
    });
  });

  it('returns method not found with null id when request id is absent', () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'unknown.method',
    };

    const response = dispatch(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: 'Method not found',
        data: { method: 'unknown.method' },
      },
      id: null,
    });
  });
});
