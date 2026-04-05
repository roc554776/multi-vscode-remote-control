import * as vscode from 'vscode';
import type { TabInfo, TabsListResult, TabsCloseResult } from './types.js';

export class TabManager {
  private getTabInputUri(tabInput: unknown): vscode.Uri | null {
    if (tabInput instanceof vscode.TabInputText) {
      return tabInput.uri;
    }
    return null;
  }

  listTabs(): TabsListResult {
    const tabs: TabInfo[] = [];
    let activeTabUri: string | null = null;

    for (const group of vscode.window.tabGroups.all) {
      const groupIndex = group.viewColumn - 1;
      
      for (let index = 0; index < group.tabs.length; index++) {
        const tab = group.tabs[index];
        if (!tab) continue;
        
        let uri: string | null = null;
        const tabUri = this.getTabInputUri(tab.input);
        if (tabUri) {
          uri = tabUri.toString();
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
        const tabUri = this.getTabInputUri(tab.input);
        if (tabUri) {
          const doc = await vscode.workspace.openTextDocument(tabUri);
          await doc.save();
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
        const tabUri = this.getTabInputUri(tab.input);
        if (tabUri && tabUri.toString() === uri) {
          return tab;
        }
      }
    }
    return null;
  }
}
