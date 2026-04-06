import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  uriFileMock,
  openTextDocumentMock,
  showTextDocumentMock,
} = vi.hoisted(() => ({
  uriFileMock: vi.fn(),
  openTextDocumentMock: vi.fn(),
  showTextDocumentMock: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: uriFileMock,
  },
  workspace: {
    openTextDocument: openTextDocumentMock,
  },
  window: {
    showTextDocument: showTextDocumentMock,
  },
}));

import { handleFileOpen } from './file-open-handler.js';
import type { JsonRpcRequest } from '../types.js';

describe('handleFileOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    uriFileMock.mockImplementation((value: string) => ({
      scheme: 'file',
      path: value,
      toString: () => `file://${value}`,
    }));

    openTextDocumentMock.mockResolvedValue({ fileName: '/tmp/test.ts' } as any);
    showTextDocumentMock.mockResolvedValue(undefined);
  });

  it('opens file with all options and returns success response', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: {
        path: '/workspace/src/index.ts',
        viewColumn: 2,
        preserveFocus: true,
        preview: false,
      },
      id: 1,
    };

    const response = await handleFileOpen(request);

    expect(uriFileMock).toHaveBeenCalledWith('/workspace/src/index.ts');
    expect(openTextDocumentMock).toHaveBeenCalledTimes(1);
    expect(showTextDocumentMock).toHaveBeenCalledWith(
      { fileName: '/tmp/test.ts' },
      {
        viewColumn: 2,
        preserveFocus: true,
        preview: false,
      }
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        opened: true,
        path: '/workspace/src/index.ts',
        uri: 'file:///workspace/src/index.ts',
      },
      id: 1,
    });
  });

  it('opens file with default empty options when optional params are not provided', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: { path: '/workspace/README.md' },
      id: 2,
    };

    const response = await handleFileOpen(request);

    expect(showTextDocumentMock).toHaveBeenCalledWith(
      { fileName: '/tmp/test.ts' },
      {}
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: {
        opened: true,
        path: '/workspace/README.md',
        uri: 'file:///workspace/README.md',
      },
      id: 2,
    });
  });

  it('includes viewColumn=0 as a valid edge-case option', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: { path: '/workspace/src/main.ts', viewColumn: 0 },
      id: 3,
    };

    await handleFileOpen(request);

    expect(showTextDocumentMock).toHaveBeenCalledWith(
      { fileName: '/tmp/test.ts' },
      { viewColumn: 0 }
    );
  });

  it('returns invalid params when path is missing', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: {},
      id: 4,
    };

    const response = await handleFileOpen(request);

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe('Invalid params');
    expect((response.error?.data as any).errors).toBeDefined();
    expect(openTextDocumentMock).not.toHaveBeenCalled();
    expect(showTextDocumentMock).not.toHaveBeenCalled();
  });

  it('returns invalid params when optional param types are invalid', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: {
        path: '/workspace/src/index.ts',
        preserveFocus: 'yes',
      } as unknown,
      id: 5,
    };

    const response = await handleFileOpen(request);

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.id).toBe(5);
    expect(openTextDocumentMock).not.toHaveBeenCalled();
  });

  it('returns internal error when vscode API throws Error object', async () => {
    openTextDocumentMock.mockRejectedValue(new Error('cannot open document'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: { path: '/workspace/src/index.ts' },
      id: 6,
    };

    const response = await handleFileOpen(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to open file: cannot open document',
      },
      id: 6,
    });
  });

  it('returns internal error when vscode API throws non-Error value', async () => {
    showTextDocumentMock.mockRejectedValue('failed-to-show');

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'file.open',
      params: { path: '/workspace/src/index.ts' },
    };

    const response = await handleFileOpen(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Failed to open file: failed-to-show',
      },
      id: null,
    });
  });
});
