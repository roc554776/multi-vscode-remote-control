import * as vscode from 'vscode';
import type { TabInfo, TabsListResult, TabsCloseResult } from './types.js';

export class TabManager {
  listTabs(): TabsListResult {
    const tabs: TabInfo[] = [];
    let activeTabUri: string | null = null;

    for (const group of vscode.window.tabGroups.all) {
      const groupIndex = group.viewColumn ? group.viewColumn - 1 : 0;
      
      for (let index = 0; index < group.tabs.length; index++) {
        const tab = group.tabs[index];
        if (!tab) continue;
        
        let uri: string | null = null;
        
        // TabInputText の場合のみ URI を取得
        if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
          const input = tab.input as { uri?: vscode.Uri };
          uri = input.uri?.toString() ?? null;
        }

        const tabInfo: TabInfo = {
          uri,
          label: tab.label,
          isActive: tab.isActive,
          isDirty: tab.isDirty,
          groupIndex,
          index,
        };

        tabs.push(tabInfo);

        if (tab.isActive && group.isActive) {
          activeTabUri = uri;
        }
      }
    }

    return { tabs, activeTabUri };
  }

  async closeTab(uri: string, save: boolean): Promise<TabsCloseResult> {
    const tab = this.findTabByUri(uri);
    
    if (!tab) {
      return { success: true, closed: false };
    }

    try {
      if (tab.isDirty && save) {
        // タブを開いて保存
        if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
          const input = tab.input as { uri?: vscode.Uri };
          if (input.uri) {
            const doc = await vscode.workspace.openTextDocument(input.uri);
            await doc.save();
          }
        }
      }

      await vscode.window.tabGroups.close(tab, !save);
      return { success: true, closed: true };
    } catch {
      return { success: false, closed: false };
    }
  }

  private findTabByUri(uri: string): vscode.Tab | null {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
          const input = tab.input as { uri?: vscode.Uri };
          if (input.uri?.toString() === uri) {
            return tab;
          }
        }
      }
    }
    return null;
  }
}
