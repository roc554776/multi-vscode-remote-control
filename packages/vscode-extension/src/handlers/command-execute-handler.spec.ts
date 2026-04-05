import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Uri } from 'vscode';

import { convertArgsForCommand, hasUriScheme } from './command-execute-handler.js';

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
});
