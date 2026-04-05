import type * as net from 'node:net';
import type { JsonRpcRequest, JsonRpcResponse, ExtensionHostInfo } from './types.js';
import { JsonRpcResponseSchema } from './types.js';

export class Router {
  private socketQueues: WeakMap<net.Socket, Promise<void>> = new WeakMap();

  async route(
    request: JsonRpcRequest,
    targetHost: ExtensionHostInfo,
  ): Promise<JsonRpcResponse> {
    const socket = targetHost.socket;
    const previous = this.socketQueues.get(socket) ?? Promise.resolve();

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const run = async () => {
        try {
          const response = await this.routeOnce(request, targetHost);
          resolve(response);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      const current = previous.catch(() => undefined).then(run);
      this.socketQueues.set(socket, current.then(() => undefined, () => undefined));
    });
  }

  private async routeOnce(
    request: JsonRpcRequest,
    targetHost: ExtensionHostInfo,
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const socket = targetHost.socket;
      // リクエストを送信
      socket.write(JSON.stringify(request) + '\n');

      let buffer = '';

      const onData = (data: Buffer) => {
        buffer += data.toString();

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed: unknown = JSON.parse(line);
              
              // レスポンスを検証
              const parseResult = JsonRpcResponseSchema.safeParse(parsed);
              if (!parseResult.success) {
                cleanup();
                reject(new Error('Invalid JSON-RPC response'));
                return;
              }
              cleanup();
              resolve(parseResult.data);
              return;
            } catch (err) {
              cleanup();
              reject(new Error(`Failed to parse response: ${String(err)}`));
              return;
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`Socket error: ${err.message}`));
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error('Request timeout'));
      };

      const cleanup = () => {
        socket.setTimeout(0);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('timeout', onTimeout);

      // デフォルト 30 秒のタイムアウト
      socket.setTimeout(30000);
    });
  }
}
