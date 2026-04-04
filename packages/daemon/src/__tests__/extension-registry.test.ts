import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as net from 'node:net';
import { ExtensionRegistry } from '../extension-registry.js';

void describe('ExtensionRegistry', () => {
  void it('should register and retrieve extension host', () => {
    const registry = new ExtensionRegistry();
    const socket = new net.Socket();
    
    registry.register('ext-1', socket);
    
    const host = registry.get('ext-1');
    assert.ok(host);
    assert.strictEqual(host.extensionId, 'ext-1');
    assert.strictEqual(host.socket, socket);
  });

  void it('should unregister extension host', () => {
    const registry = new ExtensionRegistry();
    const socket = new net.Socket();
    
    registry.register('ext-1', socket);
    assert.strictEqual(registry.size(), 1);
    
    const result = registry.unregister('ext-1');
    assert.strictEqual(result, true);
    assert.strictEqual(registry.size(), 0);
  });

  void it('should return undefined for non-existent extension', () => {
    const registry = new ExtensionRegistry();
    
    const host = registry.get('non-existent');
    assert.strictEqual(host, undefined);
  });

  void it('should select next host in round-robin fashion', () => {
    const registry = new ExtensionRegistry();
    
    registry.register('ext-1', new net.Socket());
    registry.register('ext-2', new net.Socket());
    registry.register('ext-3', new net.Socket());
    
    const host1 = registry.selectNext();
    assert.ok(host1);
    assert.strictEqual(host1.extensionId, 'ext-1');
    
    const host2 = registry.selectNext();
    assert.ok(host2);
    assert.strictEqual(host2.extensionId, 'ext-2');
    
    const host3 = registry.selectNext();
    assert.ok(host3);
    assert.strictEqual(host3.extensionId, 'ext-3');
    
    const host4 = registry.selectNext();
    assert.ok(host4);
    assert.strictEqual(host4.extensionId, 'ext-1');
  });

  void it('should return undefined when no hosts are registered', () => {
    const registry = new ExtensionRegistry();
    
    const host = registry.selectNext();
    assert.strictEqual(host, undefined);
  });

  void it('should get all registered hosts', () => {
    const registry = new ExtensionRegistry();
    
    registry.register('ext-1', new net.Socket());
    registry.register('ext-2', new net.Socket());
    
    const all = registry.getAll();
    assert.strictEqual(all.length, 2);
    assert.ok(all.some((h) => h.extensionId === 'ext-1'));
    assert.ok(all.some((h) => h.extensionId === 'ext-2'));
  });
});
