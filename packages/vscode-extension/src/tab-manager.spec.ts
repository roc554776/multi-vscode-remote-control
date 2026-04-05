import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { TabManager } from './tab-manager.js';

describe('TabManager', () => {
  let tabManager: TabManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    tabManager = new TabManager();
  });

  describe('listTabs', () => {
    it('returns empty tabs when no tabs are open', () => {
      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [],
      } as any);

      const result = tabManager.listTabs();

      expect(result).toEqual({
        tabs: [],
        activeTabUri: null,
      });
    });

    it('returns list of tabs with active tab URI', () => {
      const activeTabUri = { toString: () => 'file:///workspace/active.ts' };
      const inactiveTabUri = { toString: () => 'file:///workspace/inactive.ts' };
      
      const activeTab = {
        label: 'active.ts',
        isActive: true,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: activeTabUri }),
      };
      const inactiveTab = {
        label: 'inactive.ts',
        isActive: false,
        isDirty: true,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: inactiveTabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            viewColumn: 1,
            tabs: [activeTab, inactiveTab],
          },
        ],
      } as any);

      const result = tabManager.listTabs();

      expect(result.tabs).toHaveLength(2);
      expect(result.tabs[0]).toEqual({
        uri: 'file:///workspace/active.ts',
        label: 'active.ts',
        isActive: true,
        isDirty: false,
        groupIndex: 0,
        index: 0,
      });
      expect(result.tabs[1]).toEqual({
        uri: 'file:///workspace/inactive.ts',
        label: 'inactive.ts',
        isActive: false,
        isDirty: true,
        groupIndex: 0,
        index: 1,
      });
      expect(result.activeTabUri).toBe('file:///workspace/active.ts');
    });

    it('handles multiple tab groups', () => {
      const group1TabUri = { toString: () => 'file:///workspace/file1.ts' };
      const group2TabUri = { toString: () => 'file:///workspace/file2.ts' };
      
      const group1Tab1 = {
        label: 'file1.ts',
        isActive: true,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: group1TabUri }),
      };
      const group2Tab1 = {
        label: 'file2.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: group2TabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            viewColumn: 1,
            tabs: [group1Tab1],
          },
          {
            isActive: false,
            viewColumn: 2,
            tabs: [group2Tab1],
          },
        ],
      } as any);

      const result = tabManager.listTabs();

      expect(result.tabs).toHaveLength(2);
      expect(result.tabs[0]?.groupIndex).toBe(0);
      expect(result.tabs[1]?.groupIndex).toBe(1);
      expect(result.activeTabUri).toBe('file:///workspace/file1.ts');
    });

    it('handles tabs with null URI (non-text inputs)', () => {
      const textTabUri = { toString: () => 'file:///workspace/text.ts' };
      
      const textTab = {
        label: 'text.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: textTabUri }),
      };
      const nonTextTab = {
        label: 'Settings',
        isActive: false,
        isDirty: false,
        input: {}, // No uri property - not a TabInputText
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            viewColumn: 1,
            tabs: [textTab, nonTextTab],
          },
        ],
      } as any);

      const result = tabManager.listTabs();

      expect(result.tabs).toHaveLength(2);
      expect(result.tabs[0]?.uri).toBe('file:///workspace/text.ts');
      expect(result.tabs[1]?.uri).toBeNull();
      expect(result.tabs[1]?.label).toBe('Settings');
    });
  });

  describe('closeTab', () => {
    it('returns success with closed=false when tab is not found', async () => {
      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [],
      } as any);

      const result = await tabManager.closeTab('file:///workspace/notfound.ts', false);

      expect(result).toEqual({
        success: true,
        closed: false,
      });
    });

    it('closes tab successfully when tab exists', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const targetTabUri = { toString: () => 'file:///workspace/target.ts' };
      
      const targetTab = {
        label: 'target.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: targetTabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [targetTab],
          },
        ],
        close: closeMock,
      } as any);

      const result = await tabManager.closeTab('file:///workspace/target.ts', false);

      expect(closeMock).toHaveBeenCalledWith(targetTab, true);
      expect(result).toEqual({
        success: true,
        closed: true,
      });
    });

    it('saves dirty tab before closing when save=true', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const saveMock = vi.fn().mockResolvedValue(true);
      const targetUri = { toString: () => 'file:///workspace/dirty.ts' } as vscode.Uri;
      const dirtyTab = {
        label: 'dirty.ts',
        isActive: false,
        isDirty: true,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: targetUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [dirtyTab],
          },
        ],
        close: closeMock,
      } as any);

      const mockDocument = {
        save: saveMock,
      } as any;
      vi.spyOn(vscode.workspace, 'openTextDocument').mockResolvedValue(mockDocument);

      const result = await tabManager.closeTab('file:///workspace/dirty.ts', true);

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(targetUri);
      expect(saveMock).toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(dirtyTab, false);
      expect(result).toEqual({
        success: true,
        closed: true,
      });
    });

    it('does not save clean tab even when save=true', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const targetTabUri = { toString: () => 'file:///workspace/clean.ts' };
      
      const targetTab = {
        label: 'clean.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: targetTabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [targetTab],
          },
        ],
        close: closeMock,
      } as any);

      const openTextDocumentSpy = vi.spyOn(vscode.workspace, 'openTextDocument');

      const result = await tabManager.closeTab('file:///workspace/clean.ts', true);

      expect(openTextDocumentSpy).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(targetTab, false);
      expect(result).toEqual({
        success: true,
        closed: true,
      });
    });

    it('returns success=false when closing tab throws error', async () => {
      const closeMock = vi.fn().mockRejectedValue(new Error('Close failed'));
      const targetTabUri = { toString: () => 'file:///workspace/target.ts' };
      
      const targetTab = {
        label: 'target.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: targetTabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [targetTab],
          },
        ],
        close: closeMock,
      } as any);

      const result = await tabManager.closeTab('file:///workspace/target.ts', false);

      expect(result).toEqual({
        success: false,
        closed: false,
      });
    });
  });

  describe('findTabByUri (private method testing via closeTab)', () => {
    it('returns null when URI does not match any tab', async () => {
      const tabUri = { toString: () => 'file:///workspace/other.ts' };
      
      const tab = {
        label: 'other.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: tabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [tab],
          },
        ],
      } as any);

      // findTabByUri returns null when URI doesn't match
      const result = await tabManager.closeTab('file:///workspace/notfound.ts', false);

      expect(result).toEqual({
        success: true,
        closed: false,
      });
    });

    it('finds tab across multiple groups', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const group1TabUri = { toString: () => 'file:///workspace/file1.ts' };
      const group2TabUri = { toString: () => 'file:///workspace/target.ts' };
      
      const group1Tab = {
        label: 'file1.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: group1TabUri }),
      };
      const group2Tab = {
        label: 'target.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: group2TabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            tabs: [group1Tab],
          },
          {
            isActive: false,
            tabs: [group2Tab],
          },
        ],
        close: closeMock,
      } as any);

      const result = await tabManager.closeTab('file:///workspace/target.ts', false);

      expect(closeMock).toHaveBeenCalledWith(group2Tab, true);
      expect(result).toEqual({
        success: true,
        closed: true,
      });
    });
  });

  describe('getTabInputUri (private method testing via listTabs)', () => {
    it('returns uri for TabInputText', () => {
      const tabUri = { toString: () => 'file:///workspace/text.ts' };
      
      const tab = {
        label: 'text.ts',
        isActive: false,
        isDirty: false,
        input: Object.assign(Object.create(vscode.TabInputText.prototype), { uri: tabUri }),
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            viewColumn: 1,
            tabs: [tab],
          },
        ],
      } as any);

      const result = tabManager.listTabs();

      expect(result.tabs[0]?.uri).toBe('file:///workspace/text.ts');
    });

    it('returns null for non-TabInputText inputs', () => {
      const tab = {
        label: 'non-text',
        isActive: false,
        isDirty: false,
        input: { someOtherProperty: 'value' },
      };

      vi.spyOn(vscode.window, 'tabGroups', 'get').mockReturnValue({
        all: [
          {
            isActive: true,
            viewColumn: 1,
            tabs: [tab],
          },
        ],
      } as any);

      const result = tabManager.listTabs();

      expect(result.tabs[0]?.uri).toBeNull();
    });
  });
});
