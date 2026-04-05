import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeCommandMock } = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
}));

vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    commands: {
      executeCommand: executeCommandMock,
    },
  };
});

import { Uri } from 'vscode';

import { convertArgsForCommand, hasUriScheme, handleCommandExecute } from './command-execute-handler.js';
import type { JsonRpcRequest } from '../types.js';

describe('hasUriScheme', () => {
  it('returns true for file URI', () => {
    expect(hasUriScheme('file:///Users/test/file.md')).toBe(true);
  });

  it('returns true for untitled URI', () => {
    expect(hasUriScheme('untitled:Untitled-1')).toBe(true);
  });

  it('returns true for vscode-remote URI', () => {
    expect(hasUriScheme('vscode-remote://ssh-remote+host/path/to/file')).toBe(true);
  });

  it('returns false for POSIX path', () => {
    expect(hasUriScheme('/Users/test/file.md')).toBe(false);
  });

  it('returns false for Windows path', () => {
    expect(hasUriScheme('C:\\Users\\test\\file.md')).toBe(false);
  });
});

describe('convertArgsForCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('converts path to Uri.file() for vscode.open', () => {
    const fileSpy = vi.spyOn(Uri, 'file');
    const parseSpy = vi.spyOn(Uri, 'parse');
    const args = ['/Users/test/file.md', 'extra'];

    const result = convertArgsForCommand('vscode.open', args);

    expect(fileSpy).toHaveBeenCalledWith('/Users/test/file.md');
    expect(parseSpy).not.toHaveBeenCalled();
    expect(result).toEqual([{ scheme: 'file', path: '/Users/test/file.md' }, 'extra']);
  });

  it('converts URI to Uri.parse() for vscode.open', () => {
    const parseSpy = vi.spyOn(Uri, 'parse');
    const fileSpy = vi.spyOn(Uri, 'file');
    const args = ['file:///Users/test/file.md', 'extra'];

    const result = convertArgsForCommand('vscode.open', args);

    expect(parseSpy).toHaveBeenCalledWith('file:///Users/test/file.md');
    expect(fileSpy).not.toHaveBeenCalled();
    expect(result).toEqual([{ scheme: 'parsed', path: 'file:///Users/test/file.md' }, 'extra']);
  });

  it('does not convert args for other commands', () => {
    const parseSpy = vi.spyOn(Uri, 'parse');
    const fileSpy = vi.spyOn(Uri, 'file');
    const args = ['/Users/test/file.md', 123];

    const result = convertArgsForCommand('workbench.action.files.newUntitledFile', args);

    expect(result).toBe(args);
    expect(fileSpy).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('returns args as-is when args are empty', () => {
    const parseSpy = vi.spyOn(Uri, 'parse');
    const fileSpy = vi.spyOn(Uri, 'file');
    const args: unknown[] = [];

    const result = convertArgsForCommand('vscode.open', args);

    expect(result).toBe(args);
    expect(fileSpy).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('returns args as-is when first arg is not a string', () => {
    const parseSpy = vi.spyOn(Uri, 'parse');
    const fileSpy = vi.spyOn(Uri, 'file');
    const args = [123, 'extra'];

    const result = convertArgsForCommand('vscode.open', args);

    expect(result).toBe(args);
    expect(fileSpy).not.toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
  });
});

describe('handleCommandExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeCommandMock.mockReset();
  });

  it('returns invalid params error when params are invalid', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 123 }, // Invalid: command should be string
      id: 1,
    };

    const response = await handleCommandExecute(request);

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toBe('Invalid params');
    expect(response.error?.data).toHaveProperty('errors');
  });

  it('returns invalid params error when params are missing', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      // No params
      id: 2,
    };

    const response = await handleCommandExecute(request);

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(2);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
  });

  it('handles request with null id', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: {},
      id: null,
    };

    const response = await handleCommandExecute(request);

    expect(response.id).toBe(null);
  });

  it('executes command successfully and returns result', async () => {
    executeCommandMock.mockResolvedValue({ success: true, data: 'test result' });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'workbench.action.files.save' },
      id: 3,
    };

    const response = await handleCommandExecute(request);

    expect(executeCommandMock).toHaveBeenCalledWith('workbench.action.files.save');
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: { success: true, data: 'test result' },
      id: 3,
    });
  });

  it('executes command with args', async () => {
    executeCommandMock.mockResolvedValue(undefined);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'editor.action.insertSnippet', args: [{ snippet: 'test' }] },
      id: 4,
    };

    const response = await handleCommandExecute(request);

    expect(executeCommandMock).toHaveBeenCalledWith('editor.action.insertSnippet', { snippet: 'test' });
    expect(response).toEqual({
      jsonrpc: '2.0',
      result: undefined,
      id: 4,
    });
  });

  it('converts URI for vscode.open command', async () => {
    executeCommandMock.mockResolvedValue(undefined);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'vscode.open', args: ['/path/to/file.txt'] },
      id: 5,
    };

    const response = await handleCommandExecute(request);

    expect(executeCommandMock).toHaveBeenCalledWith('vscode.open', { scheme: 'file', path: '/path/to/file.txt' });
    expect(response.error).toBeUndefined();
    expect(response.id).toBe(5);
  });

  it('returns timeout response when command takes too long', async () => {
    vi.useFakeTimers();
    
    // Command that never resolves
    executeCommandMock.mockReturnValue(new Promise(() => {}));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'slow.command', timeout: 1000 },
      id: 6,
    };

    const responsePromise = handleCommandExecute(request);
    
    // Advance timers to trigger timeout
    await vi.advanceTimersByTimeAsync(1000);
    
    const response = await responsePromise;

    expect(response).toEqual({
      jsonrpc: '2.0',
      result: { 
        dispatched: true, 
        command: 'slow.command', 
        message: 'Command dispatched (no response within timeout)' 
      },
      id: 6,
    });

    vi.useRealTimers();
  });

  it('uses default timeout when not specified', async () => {
    vi.useFakeTimers();
    
    executeCommandMock.mockReturnValue(new Promise(() => {}));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'slow.command' },
      id: 7,
    };

    const responsePromise = handleCommandExecute(request);
    
    // Default timeout is 5000ms
    await vi.advanceTimersByTimeAsync(5000);
    
    const response = await responsePromise;

    expect(response.result).toHaveProperty('dispatched', true);
    expect(response.id).toBe(7);

    vi.useRealTimers();
  });

  it('returns error when command execution fails', async () => {
    executeCommandMock.mockRejectedValue(new Error('Command not found'));

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'invalid.command' },
      id: 8,
    };

    const response = await handleCommandExecute(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Command failed: Command not found',
      },
      id: 8,
    });
  });

  it('handles non-Error rejection', async () => {
    executeCommandMock.mockRejectedValue('String error');

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'failing.command' },
      id: 9,
    };

    const response = await handleCommandExecute(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Command failed: String error',
      },
      id: 9,
    });
  });

  it('catches unexpected errors during execution', async () => {
    // Mock CommandExecuteParamsSchema.safeParse to throw
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'valid.command' },
      id: 10,
    };

    // Make executeCommand throw synchronously
    executeCommandMock.mockImplementation(() => {
      throw new Error('Unexpected sync error');
    });

    const response = await handleCommandExecute(request);

    expect(response).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Unexpected error: Unexpected sync error',
      },
      id: 10,
    });
  });

  it('handles non-Error unexpected errors', async () => {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'command.execute',
      params: { command: 'error.command' },
      id: 11,
    };

    executeCommandMock.mockImplementation(() => {
      throw 'String exception';
    });

    const response = await handleCommandExecute(request);

    expect(response.error?.message).toBe('Unexpected error: String exception');
  });
});
