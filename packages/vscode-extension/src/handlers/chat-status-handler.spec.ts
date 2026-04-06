import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { handleChatStatus } from './chat-status-handler.js';
import type { JsonRpcRequest } from '../types.js';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    tabGroups: {
      all: [],
    },
  },
  TabInputWebview: class TabInputWebview {
    viewType: string;
    constructor(viewType: string) {
      this.viewType = viewType;
    }
  },
}));

describe('handleChatStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns open=false, focused=false when no chat tabs exist', async () => {
    // Mock empty tab groups
    vi.mocked(vscode.window.tabGroups).all = [];

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 1,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: false,
        focused: false,
        busy: null,
      },
      id: 1,
    });
  });

  it('returns open=true, focused=false when chat tab exists but is not active', async () => {
    // Mock tab groups with a chat tab that is not active
    const chatInput = new vscode.TabInputWebview('workbench.panel.chat');
    const mockTab = {
      input: chatInput,
      isActive: false,
    };
    const mockGroup = {
      tabs: [mockTab],
      isActive: false,
    };
    vi.mocked(vscode.window.tabGroups).all = [mockGroup] as any;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 2,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: true,
        focused: false,
        busy: null,
      },
      id: 2,
    });
  });

  it('returns open=true, focused=true when chat tab is active in active group', async () => {
    // Mock tab groups with an active chat tab in active group
    const chatInput = new vscode.TabInputWebview('workbench.panel.chat');
    const mockTab = {
      input: chatInput,
      isActive: true,
    };
    const mockGroup = {
      tabs: [mockTab],
      isActive: true,
    };
    vi.mocked(vscode.window.tabGroups).all = [mockGroup] as any;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 3,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: true,
        focused: true,
        busy: null,
      },
      id: 3,
    });
  });

  it('ignores non-chat webview tabs', async () => {
    // Mock tab groups with a non-chat webview tab
    const nonChatInput = new vscode.TabInputWebview('some.other.webview');
    const mockTab = {
      input: nonChatInput,
      isActive: true,
    };
    const mockGroup = {
      tabs: [mockTab],
      isActive: true,
    };
    vi.mocked(vscode.window.tabGroups).all = [mockGroup] as any;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 4,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: false,
        focused: false,
        busy: null,
      },
      id: 4,
    });
  });

  it('ignores non-webview tabs', async () => {
    // Mock tab groups with a text editor tab
    const mockTab = {
      input: { /* TabInputText */ uri: { path: '/some/file.ts' } },
      isActive: true,
    };
    const mockGroup = {
      tabs: [mockTab],
      isActive: true,
    };
    vi.mocked(vscode.window.tabGroups).all = [mockGroup] as any;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 5,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: false,
        focused: false,
        busy: null,
      },
      id: 5,
    });
  });

  it('handles multiple tab groups with mixed tabs', async () => {
    // Mock multiple tab groups
    const chatInput = new vscode.TabInputWebview('workbench.panel.chat');
    const nonChatInput = new vscode.TabInputWebview('some.other.webview');
    
    const chatTab = {
      input: chatInput,
      isActive: true,
    };
    const nonChatTab = {
      input: nonChatInput,
      isActive: false,
    };
    
    const group1 = {
      tabs: [chatTab],
      isActive: true,
    };
    const group2 = {
      tabs: [nonChatTab],
      isActive: false,
    };
    
    vi.mocked(vscode.window.tabGroups).all = [group1, group2] as any;

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 6,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: true,
        focused: true,
        busy: null,
      },
      id: 6,
    });
  });

  it('returns error when an exception occurs', async () => {
    // Force an error by making tabGroups.all throw
    Object.defineProperty(vscode.window.tabGroups, 'all', {
      get: () => {
        throw new Error('Test error');
      },
      configurable: true,
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
      id: 7,
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to get chat status: Test error',
      },
      id: 7,
    });
  });

  it('handles request without id', async () => {
    // Reset mock to clean state after the error test
    Object.defineProperty(vscode.window.tabGroups, 'all', {
      get: () => [],
      configurable: true,
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'chat.status',
    };

    const response = handleChatStatus(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        open: false,
        focused: false,
        busy: null,
      },
      id: null,
    });
  });
});
