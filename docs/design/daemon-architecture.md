# Design: daemon アーキテクチャ

> **⚠️ このドキュメントは廃止されました**
>
> このドキュメントは、extension host ごとに独自の IPC socket (`ext-*.sock`) を作成する旧設計を記述しています。
>
> **PR #16** で daemon アーキテクチャは簡素化され、現在は daemon が単一の socket のみを持ち、extension host は長寿命接続を確立する方式に変更されました。
>
> **現在の設計ドキュメント**: [daemon-simplification.md](./daemon-simplification.md)
>
> このドキュメントは参考・履歴目的でのみ保持されています。
>
> ---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│                     External Client (vcc)                    │
└───────────────────────┬─────────────────────────────────────┘
                        │ JSON-RPC over IPC
                        │ (~/.vcc-remote-control/daemon.sock)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      VCC Daemon Process                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  External IPC Server (daemon.sock)                     │ │
│  │  - Receives requests from external clients             │ │
│  │  - Routes to appropriate extension host                │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Internal IPC Server (daemon-internal.sock)            │ │
│  │  - Handles extension host registration/deregistration  │ │
│  │  - Receives heartbeats from extension hosts            │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Window Registry                                        │ │
│  │  - windowId -> { socket, metadata, lastHeartbeat }     │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────┬─────────────────────┬───────────────────────────┘
            │                     │
            │ Forward requests    │ Registration/Heartbeat
            │                     │
    ┌───────▼───────┐     ┌───────▼───────┐
    │ VSCode Win 1  │     │ VSCode Win 2  │
    │ ┌───────────┐ │     │ ┌───────────┐ │
    │ │ Extension │ │     │ │ Extension │ │
    │ │   Host    │ │     │ │   Host    │ │
    │ │           │ │     │ │           │ │
    │ │ IPC Server│ │     │ │ IPC Server│ │
    │ │ (ext-*.sock)│     │ │ (ext-*.sock)│
    │ └───────────┘ │     │ └───────────┘ │
    └───────────────┘     └───────────────┘
```

## コンポーネント設計

### 1. daemon プロセス

#### 1.1 実装言語とランタイム

- **言語**: TypeScript (Node.js)
- **理由**: 既存のコードベースとの統一性、npm パッケージの再利用

#### 1.2 パッケージ構成

```
packages/
├── vscode-extension/    # 既存
│   └── src/
│       ├── extension.ts          # 修正: daemon spawn 機能追加
│       ├── ipc-server.ts         # 修正: extension host 用サーバー
│       ├── daemon-client.ts      # 新規: daemon との通信クライアント
│       └── ...
└── daemon/              # 新規
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── main.ts              # エントリーポイント
        ├── external-server.ts   # 外部クライアント用 IPC サーバー
        ├── internal-server.ts   # extension host 用 IPC サーバー
        ├── window-registry.ts   # ウィンドウ管理
        ├── router.ts            # リクエストルーティング
        └── types.ts             # 型定義
```

#### 1.3 daemon のライフサイクル

```typescript
// packages/daemon/src/main.ts

async function main() {
  // 1. IPC サーバー起動
  // listen 時に EADDRINUSE が発生したら
  // 既存 daemon が稼働中なので process.exit(0) で終了
  const internalServer = new InternalServer();
  const externalServer = new ExternalServer();
  
  await internalServer.start();
  await externalServer.start();

  // 2. 終了処理の登録
  process.on('SIGTERM', async () => {
    await shutdown(internalServer, externalServer);
  });

  // 3. アイドル監視（すべてのウィンドウが登録解除されたら終了）
  startIdleMonitor(() => {
    process.exit(0);
  });
}
```

#### 1.4 シングルトン実現方法

**アプローチ**: Socket バインドの EADDRINUSE エラーによる排他制御（VSCode 方式準拠）

Socket 自体がシングルトンロックとして機能します。これは VSCode や多くの daemon 実装で採用されている堅牢な方式です。

> 参照: `knowledge/codebase/microsoft/vscode/SINGLETON_ANALYSIS.md`
>
> VSCode の運用では、排他の主本体は IPC endpoint の bind 競合（`EADDRINUSE`）であり、
> lock file は PID/接続先可視化など補助用途です。さらに Unix 系では
> `EADDRINUSE` 後の接続で `ECONNREFUSED` を検知した場合に stale socket を
> `unlink` して `listen` を retry する自己修復パスがあります。

```typescript
// packages/daemon/src/daemon-server.ts

start(): void {
  this.server = net.createServer((socket) => {
    this.handleConnection(socket);
  });

  this.server.listen(this.socketPath, () => {
    this.log(`Daemon listening on ${this.socketPath}`);
    
    // Set socket permissions (Unix)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.socketPath, 0o600);
    }
  });

  this.server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // 既に daemon が起動済み
      this.log('Socket already in use - daemon is already running');
      process.exit(0); // 正常終了（重複起動は異常ではない）
    } else {
      this.log(`Server error: ${err.message}`);
      throw err;
    }
  });
}
```

**利点**:

1. **原子性**: Socket バインドは OS レベルでアトミックな操作
2. **stale socket の自己修復**: `EADDRINUSE` + `ECONNREFUSED` 時に `unlink` + retry
3. **シンプル**: PID チェックや lock file 管理が不要
4. **クロスプラットフォーム**: Unix socket と Named Pipe で同じロジック

**extension からの daemon 起動**:

```typescript
// packages/vscode-extension/src/daemon-spawner.ts

async ensureDaemonRunning(): Promise<void> {
  // 接続試行で daemon の稼働状況を確認
  try {
    await this.testConnection();
    // 接続成功 → daemon 起動済み
    return;
  } catch {
    // 接続失敗 → daemon を spawn
    this.spawnDaemon();
    
    // spawn 後、ready になるまで待機
    await this.waitForReady();
  }
}

private spawnDaemon(): void {
  const child = spawn('node', [this.daemonPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
```

**重要**: lock file は完全に削除されます。Socket ファイル自体がロックとして機能します。

### 2. Window Registry

```typescript
// packages/daemon/src/window-registry.ts

export interface WindowInfo {
  windowId: string;
  socketPath: string;
  metadata: {
    pid: number;
    workspaceName?: string;
    workspacePath?: string;
  };
  lastHeartbeat: number; // timestamp
}

export class WindowRegistry {
  private windows = new Map<string, WindowInfo>();
  private defaultWindowId: string | null = null;

  register(info: WindowInfo): void {
    this.windows.set(info.windowId, info);
    this.defaultWindowId = info.windowId; // 最新のものをデフォルトに
  }

  unregister(windowId: string): void {
    this.windows.delete(windowId);
    if (this.defaultWindowId === windowId) {
      this.defaultWindowId = this.windows.keys().next().value ?? null;
    }
  }

  updateHeartbeat(windowId: string): void {
    const win = this.windows.get(windowId);
    if (win) {
      win.lastHeartbeat = Date.now();
    }
  }

  getWindow(windowId: string): WindowInfo | undefined {
    return this.windows.get(windowId);
  }

  getDefaultWindow(): WindowInfo | undefined {
    return this.defaultWindowId ? this.windows.get(this.defaultWindowId) : undefined;
  }

  listWindows(): WindowInfo[] {
    return Array.from(this.windows.values());
  }

  isIdle(): boolean {
    return this.windows.size === 0;
  }

  // ハートビートタイムアウトのチェック
  removeStaleWindows(timeoutMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];
    
    for (const [id, info] of this.windows) {
      if (now - info.lastHeartbeat > timeoutMs) {
        stale.push(id);
      }
    }
    
    stale.forEach(id => this.unregister(id));
    return stale;
  }
}
```

### 3. Internal IPC Server (extension host 用)

```typescript
// packages/daemon/src/internal-server.ts

export class InternalServer {
  private server: net.Server | null = null;
  private registry: WindowRegistry;

  async start(): Promise<void> {
    const socketPath = getInternalSocketPath();
    
    // Clean up stale socket
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(socketPath, () => {
        if (process.platform !== 'win32') {
          fs.chmodSync(socketPath, 0o600);
        }
        resolve();
      });
    });

    // ハートビートタイムアウトの定期チェック
    setInterval(() => {
      const stale = this.registry.removeStaleWindows(60000);
      if (stale.length > 0) {
        console.log(`Removed stale windows: ${stale.join(', ')}`);
      }
    }, 10000);
  }

  private async handleConnection(socket: net.Socket): Promise<void> {
    // JSON-RPC over line-delimited JSON
    // Methods:
    //   - daemon.register({ windowId, socketPath, metadata })
    //   - daemon.unregister({ windowId })
    //   - daemon.heartbeat({ windowId })
  }
}

function getInternalSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\vcc-daemon-internal';
  } else {
    return path.join(os.homedir(), '.vcc-remote-control', 'daemon-internal.sock');
  }
}
```

### 4. External IPC Server (外部クライアント用)

```typescript
// packages/daemon/src/external-server.ts

export class ExternalServer {
  private server: net.Server | null = null;
  private registry: WindowRegistry;
  private router: Router;

  async start(): Promise<void> {
    const socketPath = getExternalSocketPath();
    
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(socketPath, () => {
        if (process.platform !== 'win32') {
          fs.chmodSync(socketPath, 0o600);
        }
        resolve();
      });
    });
  }

  private async handleConnection(socket: net.Socket): Promise<void> {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) {
          const response = await this.processRequest(line);
          socket.write(JSON.stringify(response) + '\n');
        }
      }
    });
  }

  private async processRequest(line: string): Promise<JsonRpcResponse> {
    try {
      const request = JSON.parse(line);
      
      // daemon 専用メソッドの処理
      if (request.method === 'daemon.listWindows') {
        return this.handleListWindows(request);
      }

      // その他のメソッドは extension host にルーティング
      return await this.router.route(request);
      
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      };
    }
  }

  private handleListWindows(request: JsonRpcRequest): JsonRpcResponse {
    const windows = this.registry.listWindows().map(w => ({
      windowId: w.windowId,
      metadata: w.metadata,
    }));

    return {
      jsonrpc: '2.0',
      result: windows,
      id: request.id,
    };
  }
}

function getExternalSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\vcc-remote-control';
  } else {
    return path.join(os.homedir(), '.vcc-remote-control', 'daemon.sock');
  }
}
```

### 5. Router

```typescript
// packages/daemon/src/router.ts

export class Router {
  constructor(private registry: WindowRegistry) {}

  async route(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // windowId の取得（パラメータから、またはデフォルト）
    const windowId = this.extractWindowId(request);
    
    let targetWindow: WindowInfo | undefined;
    
    if (windowId) {
      targetWindow = this.registry.getWindow(windowId);
      if (!targetWindow) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: `Window not found: ${windowId}`,
          },
          id: request.id,
        };
      }
    } else {
      targetWindow = this.registry.getDefaultWindow();
      if (!targetWindow) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32002,
            message: 'No windows available',
          },
          id: request.id,
        };
      }
    }

    // extension host に転送
    return await this.forward(request, targetWindow);
  }

  private extractWindowId(request: JsonRpcRequest): string | null {
    // Option 1: パラメータオブジェクトに windowId を含める
    if (typeof request.params === 'object' && request.params !== null) {
      const params = request.params as Record<string, unknown>;
      if (typeof params.windowId === 'string') {
        return params.windowId;
      }
    }
    return null;
  }

  private async forward(
    request: JsonRpcRequest,
    target: WindowInfo
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(target.socketPath);
      
      socket.on('connect', () => {
        // windowId パラメータを除去してから転送
        const forwardRequest = this.stripWindowId(request);
        socket.write(JSON.stringify(forwardRequest) + '\n');
      });

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        
        if (lines.length > 1) {
          const responseLine = lines[0];
          socket.end();
          
          try {
            const response = JSON.parse(responseLine);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        }
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private stripWindowId(request: JsonRpcRequest): JsonRpcRequest {
    if (typeof request.params === 'object' && request.params !== null) {
      const params = { ...request.params } as Record<string, unknown>;
      delete params.windowId;
      return { ...request, params };
    }
    return request;
  }
}
```

### 6. Extension Host の変更

#### 6.1 daemon の spawn と登録

```typescript
// packages/vscode-extension/src/extension.ts

import * as vscode from 'vscode';
import * as child_process from 'node:child_process';
import { IPCServer } from './ipc-server.js';
import { DaemonClient } from './daemon-client.js';

let server: IPCServer | null = null;
let daemonClient: DaemonClient | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('VCC Remote Control');
  outputChannel.appendLine('vcc-remote-control extension activated');

  // 1. daemon が起動しているかチェック、起動していなければ spawn
  await ensureDaemonRunning(outputChannel);

  // 2. extension host 用の IPC サーバーを起動
  server = new IPCServer(outputChannel);
  const socketPath = await server.start();

  // 3. daemon に登録
  daemonClient = new DaemonClient(outputChannel);
  await daemonClient.connect();
  
  const windowId = generateWindowId();
  await daemonClient.register({
    windowId,
    socketPath,
    metadata: {
      pid: process.pid,
      workspaceName: vscode.workspace.name,
      workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
  });

  // 4. ハートビート開始
  const heartbeatInterval = setInterval(() => {
    daemonClient?.heartbeat(windowId);
  }, 30000);

  context.subscriptions.push({
    dispose: async () => {
      clearInterval(heartbeatInterval);
      
      if (daemonClient) {
        await daemonClient.unregister(windowId);
        daemonClient.disconnect();
      }
      
      if (server) {
        server.stop();
        server = null;
      }
    },
  });
}

async function ensureDaemonRunning(
  outputChannel: vscode.OutputChannel
): Promise<void> {
  const daemonSocketPath = getDaemonSocketPath();
  
  // daemon socket に接続を試みる
  if (await isDaemonRunning(daemonSocketPath)) {
    outputChannel.appendLine('Daemon is already running');
    return;
  }

  // daemon を spawn
  outputChannel.appendLine('Spawning daemon...');
  
  const daemonPath = getDaemonExecutablePath();
  const daemonProcess = child_process.spawn(daemonPath, [], {
    detached: true,
    stdio: 'ignore',
  });
  
  daemonProcess.unref();

  // daemon の起動を待つ
  for (let i = 0; i < 10; i++) {
    await sleep(100);
    if (await isDaemonRunning(daemonSocketPath)) {
      outputChannel.appendLine('Daemon started successfully');
      return;
    }
  }

  throw new Error('Failed to start daemon');
}

function generateWindowId(): string {
  return `win-${process.pid}-${Date.now()}`;
}
```

#### 6.2 extension host の IPC サーバー

```typescript
// packages/vscode-extension/src/ipc-server.ts

export class IPCServer {
  private server: net.Server | null = null;
  private socketPath: string;

  async start(): Promise<string> {
    // 一意な socket パスを生成
    this.socketPath = this.generateSocketPath();

    // Clean up stale socket
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.socketPath, () => {
        if (process.platform !== 'win32') {
          fs.chmodSync(this.socketPath, 0o600);
        }
        resolve();
      });
    });

    return this.socketPath;
  }

  private generateSocketPath(): string {
    if (process.platform === 'win32') {
      return `\\\\.\\pipe\\vcc-ext-${process.pid}`;
    } else {
      const dir = path.join(os.homedir(), '.vcc-remote-control');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { mode: 0o700 });
      }
      return path.join(dir, `ext-${process.pid}.sock`);
    }
  }

  // handleConnection, processRequest などは既存のまま
}
```

#### 6.3 daemon クライアント

```typescript
// packages/vscode-extension/src/daemon-client.ts

export class DaemonClient {
  private socket: net.Socket | null = null;
  private requestId = 0;

  async connect(): Promise<void> {
    const socketPath = getInternalDaemonSocketPath();
    
    this.socket = net.connect(socketPath);
    
    await new Promise<void>((resolve, reject) => {
      this.socket!.on('connect', resolve);
      this.socket!.on('error', reject);
    });
  }

  async register(info: {
    windowId: string;
    socketPath: string;
    metadata: object;
  }): Promise<void> {
    await this.sendRequest('daemon.register', info);
  }

  async unregister(windowId: string): Promise<void> {
    await this.sendRequest('daemon.unregister', { windowId });
  }

  async heartbeat(windowId: string): Promise<void> {
    // fire-and-forget (レスポンスを待たない)
    this.sendRequest('daemon.heartbeat', { windowId }).catch(() => {});
  }

  private async sendRequest(method: string, params: object): Promise<unknown> {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this.requestId,
    };

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.write(JSON.stringify(request) + '\n');

      // レスポンスを受け取る（簡略化）
      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        if (lines.length > 1) {
          this.socket!.off('data', onData);
          const response = JSON.parse(lines[0]);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };

      this.socket.on('data', onData);
      
      setTimeout(() => {
        this.socket!.off('data', onData);
        reject(new Error('Request timeout'));
      }, 5000);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}
```

### 7. ビルドとデプロイ

#### 7.1 daemon のビルド

```json
// packages/daemon/package.json
{
  "name": "@vcc/daemon",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js"
  },
  "bin": {
    "vcc-daemon": "dist/main.js"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

#### 7.2 daemon の配布

extension のパッケージに daemon の実行ファイルを含める:

```
packages/vscode-extension/
├── out/
│   └── daemon/       # daemon のビルド成果物をコピー
│       └── main.js
└── package.json
```

```typescript
// daemon 実行パスの取得
function getDaemonExecutablePath(): string {
  const extensionPath = vscode.extensions.getExtension('your-publisher.vcc-remote-control')!.extensionPath;
  return path.join(extensionPath, 'out', 'daemon', 'main.js');
}
```

## データフロー

### ケース1: 外部クライアントからのリクエスト（windowId 指定なし）

```
1. vcc tabs.list
   ↓
2. daemon.sock に JSON-RPC リクエスト送信
   ↓
3. ExternalServer が受信
   ↓
4. Router がデフォルトウィンドウを選択
   ↓
5. Router が ext-{pid}.sock に転送
   ↓
6. Extension Host の IPCServer が受信・処理
   ↓
7. レスポンスを Router に返す
   ↓
8. Router が ExternalServer に返す
   ↓
9. ExternalServer がクライアントに返す
```

### ケース2: 外部クライアントからのリクエスト（windowId 指定あり）

```
1. vcc tabs.list --window-id win-12345-1234567890
   ↓
2. daemon.sock に JSON-RPC リクエスト送信
   { method: "tabs.list", params: { windowId: "win-12345-1234567890" } }
   ↓
3. Router が windowId でウィンドウを検索
   ↓
4. 該当ウィンドウの socket に転送（windowId パラメータは除去）
   ↓
5. レスポンスを返す
```

### ケース3: Extension Host の登録

```
1. VSCode ウィンドウ起動
   ↓
2. Extension activate
   ↓
3. daemon が起動していなければ spawn
   ↓
4. Extension Host の IPC サーバー起動 (ext-{pid}.sock)
   ↓
5. daemon-internal.sock に接続
   ↓
6. daemon.register を送信
   { windowId: "win-12345-...", socketPath: "~/.vcc-remote-control/ext-12345.sock", metadata: {...} }
   ↓
7. WindowRegistry に登録
   ↓
8. 30秒ごとに heartbeat 送信開始
```

## エラーハンドリング

### daemon クラッシュ時の復旧

1. Extension host がハートビート送信時に daemon への接続失敗を検知
2. 次回のハートビート時に daemon への再接続を試みる
3. 接続できない場合は、新しい daemon を spawn
4. 再登録を行う

### Extension host クラッシュ時の処理

1. daemon がハートビートタイムアウト（60秒）を検知
2. WindowRegistry から該当ウィンドウを削除
3. 次回のリクエスト時には該当ウィンドウは存在しない

## マイグレーション計画

### Phase 1: daemon の実装

- daemon パッケージを作成
- InternalServer, ExternalServer, Router, WindowRegistry を実装
- 単体テストを作成

### Phase 2: Extension の修正

- daemon spawn ロジックを実装
- DaemonClient を実装
- extension host の IPC サーバーを一意な socket パスで起動するように修正

### Phase 3: 統合テスト

- 単一ウィンドウのシナリオをテスト
- 複数ウィンドウのシナリオをテスト
- ウィンドウのライフサイクルをテスト

### Phase 4: 下位互換性の確保

- 古い socket パス (`vcc.sock`) をシンボリックリンクとして作成する
- または、vcc CLI に socket パスの設定オプションを追加

## セキュリティ考慮事項

1. **Socket パーミッション**: すべての socket ファイルは 0600 で作成
2. **プロセス分離**: daemon と extension host は別プロセスで動作
3. **認証**: 同一ユーザーのプロセスのみが socket にアクセス可能（Unix domain socket の特性）

## パフォーマンス考慮事項

1. **レイテンシ**: daemon を経由することで 1-2ms の追加レイテンシが発生する可能性がある
2. **スループット**: daemon が単一プロセスであるため、並列リクエスト処理は Node.js のイベントループに依存
3. **メモリ**: daemon は軽量（ウィンドウ情報のみを保持）で、メモリ使用量は最小限

## 今後の拡張性

1. **リモートウィンドウのサポート**: daemon を TCP socket でも listen させることで、リモートマシンの VSCode にもアクセス可能
2. **イベント購読**: daemon がウィンドウのイベント（タブの変更など）を購読し、クライアントにプッシュ通知
3. **ロードバランシング**: 複数のウィンドウに対してリクエストを分散
