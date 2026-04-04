import type * as net from 'node:net';
import type { ExtensionHostInfo } from './types.js';

export class ExtensionRegistry {
  private hosts: Map<string, ExtensionHostInfo> = new Map();
  private lastRouted = 0;

  register(extensionId: string, socket: net.Socket): void {
    this.hosts.set(extensionId, {
      extensionId,
      socket,
      registeredAt: new Date(),
    });
  }

  unregister(extensionId: string): boolean {
    return this.hosts.delete(extensionId);
  }

  get(extensionId: string): ExtensionHostInfo | undefined {
    return this.hosts.get(extensionId);
  }

  getAll(): ExtensionHostInfo[] {
    return Array.from(this.hosts.values());
  }

  size(): number {
    return this.hosts.size;
  }

  // ラウンドロビン方式でルーティング先を選択
  selectNext(): ExtensionHostInfo | undefined {
    const all = this.getAll();
    if (all.length === 0) {
      return undefined;
    }

    const index = this.lastRouted % all.length;
    this.lastRouted += 1;
    
    // 配列の長さが変わっている可能性があるため、安全にアクセス
    return all[index] ?? all[0];
  }
}
