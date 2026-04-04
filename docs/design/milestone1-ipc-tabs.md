# Milestone 1: タブ操作機能 設計ドキュメント

> **📝 アーキテクチャに関する注記**
>
> このドキュメントは Milestone 1 の初期設計を記述しています。その後、複数 VSCode ウィンドウへの対応として daemon アーキテクチャが導入されました（PR #16）。
>
> **現在のアーキテクチャ**: extension は daemon プロセスに長寿命接続し、外部クライアントは daemon 経由で複数の VSCode ウィンドウと通信します。詳細は [daemon-simplification.md](./daemon-simplification.md) を参照してください。

## 概要

このドキュメントは、vcc-remote-control の Milestone 1 における技術設計を定義する。
外部プログラムから VSCode 拡張機能と通信し、タブの情報取得と操作を実現する。

## 技術選定

### 1. VSCode 拡張機能

- **言語**: TypeScript
- **対応 VSCode バージョン**: 1.85.0 以上（`vscode.window.tabGroups` API の安定版）
- **ビルドツール**: esbuild（軽量・高速・VSCode 公式推奨）
- **scaffolding**: `yo code` generator を使用（標準構成を踏襲）
- **パッケージマネージャー**: npm

#### package.json の主要構成

```json
{
  "name": "vcc-remote-control",
  "displayName": "VSCode Copilot Chat Remote Control",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {}
}
```

**activation events**: `onStartupFinished` を使用
- VSCode 起動直後にアクティベートされる
- 他の拡張機能の起動を妨げない（遅延起動）
- REQ-1.2 を満たす

### 2. IPC 通信方式

**選定: Unix Domain Socket（Windows は Named Pipe）**

#### 選定理由

| 方式 | 利点 | 欠点 |
|------|------|------|
| **Unix Domain Socket** | ・ファイルシステムベースで管理しやすい<br>・TCP より低オーバーヘッド<br>・権限制御が可能 | ・Windows で非標準 |
| Named Pipe | ・Windows ネイティブ | ・macOS/Linux で非標準<br>・API が異なる |
| TCP (localhost) | ・クロスプラットフォーム | ・ポート競合の可能性<br>・セキュリティ設定が必要 |

**決定**: macOS/Linux では Unix Domain Socket、Windows では Named Pipe を使用
- Node.js の `net.createServer()` は両方をサポート
- パスの命名規則を工夫することで統一的に扱える

#### ソケットパス

- **macOS/Linux**: `~/.vcc-remote-control/vcc.sock`
- **Windows**: `\\\\?\\pipe\\vcc-remote-control`

ディレクトリは初回起動時に自動作成し、権限を `700` に設定。

### 3. 通信プロトコル

**選定: JSON-RPC 2.0 over Unix Socket / Named Pipe**

#### 選定理由

- **シンプル**: リクエスト/レスポンスモデルが明確
- **標準化**: エラーハンドリング、バッチリクエストが仕様化
- **拡張性**: method 追加が容易
- **デバッグ性**: JSON なので可読性が高い

#### プロトコル詳細

- **フレーミング**: 改行区切り（`\n`）
- **エンコーディング**: UTF-8
- **1リクエスト = 1行 JSON**

```
{"jsonrpc":"2.0","method":"ping","id":1}\n
```

## アーキテクチャ

### システム構成図

```
┌───────────────────────────────────────────────────┐
│                    VSCode                         │
│  ┌─────────────────────────────────────────────┐  │
│  │       vcc-remote-control Extension          │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────┐    │  │
│  │  │      Extension Host (Node.js)        │    │  │
│  │  │  ┌───────────────────────────────┐   │    │  │
│  │  │  │   IPC Server                   │   │    │  │
│  │  │  │   - Unix Socket / Named Pipe   │   │    │  │
│  │  │  │   - JSON-RPC Handler           │   │    │  │
│  │  │  └───────────────────────────────┘   │    │  │
│  │  │  ┌───────────────────────────────┐   │    │  │
│  │  │  │   Tab Manager                  │   │    │  │
│  │  │  │   - vscode.window.tabGroups   │   │    │  │
│  │  │  └───────────────────────────────┘   │    │  │
│  │  └─────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
                       ↑
                       │ JSON-RPC over Socket/Pipe
                       │
┌───────────────────────────────────────────────────┐
│            External Client Program                │
│   - CLI Tool (Node.js / Python / Shell)           │
│   - Automation Script                             │
│   - Test Suite                                    │
└───────────────────────────────────────────────────┘
```

### コンポーネント設計

#### 1. Extension (extension.ts)

拡張機能のエントリーポイント。

```typescript
export function activate(context: vscode.ExtensionContext) {
  // IPC サーバーを起動
  const server = new IPCServer();
  server.start();
  
  context.subscriptions.push({
    dispose: () => server.stop()
  });
}
```

#### 2. IPCServer (ipc-server.ts)

- Unix Socket / Named Pipe サーバーの管理
- 接続受付とセッション管理（REQ-1.3 対応）
- JSON-RPC パース・ディスパッチ
- エラーハンドリング（NFR-1.1）

主要機能:
- `start()`: サーバー起動
- `stop()`: サーバー停止・クリーンアップ
- `handleConnection(socket)`: クライアント接続処理
- `dispatch(request)`: メソッドルーティング

#### 3. TabManager (tab-manager.ts)

VSCode Tab Groups API を抽象化。

```typescript
class TabManager {
  // タブ一覧取得（REQ-2.1, REQ-2.2）
  async listTabs(): Promise<TabInfo[]> {
    const tabs = vscode.window.tabGroups.all.flatMap(group => 
      group.tabs.map((tab, index) => ({
        uri: (tab.input as vscode.TabInputText)?.uri?.toString(),
        label: tab.label,
        isActive: tab.isActive,
        isDirty: tab.isDirty,
        groupIndex: group.viewColumn - 1,
        index: index
      }))
    );
    return tabs;
  }

  // タブを閉じる（REQ-3.1, REQ-3.2）
  async closeTab(uri: string, save: boolean): Promise<boolean> {
    const tab = this.findTabByUri(uri);
    if (!tab) return false;
    
    if (tab.isDirty && save) {
      await vscode.window.showTextDocument(tab.input.uri);
      await vscode.commands.executeCommand('workbench.action.files.save');
    }
    
    await vscode.window.tabGroups.close(tab);
    return true;
  }
}
```

#### 4. Handlers (handlers/)

JSON-RPC メソッドハンドラー。

- `ping-handler.ts`: ping/pong 実装（REQ-4.1）
- `tabs-list-handler.ts`: tabs.list 実装
- `tabs-close-handler.ts`: tabs.close 実装

## API 設計

### Method: `ping`

接続確認用。サーバーが応答可能かテストする。

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ping",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "message": "pong",
    "timestamp": 1234567890
  },
  "id": 1
}
```

**エラー:**
なし（常に成功）

---

### Method: `tabs.list`

現在開いているタブの一覧を取得する。

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tabs.list",
  "params": {
    "includeGroupInfo": true
  },
  "id": 2
}
```

**Parameters:**
- `includeGroupInfo` (boolean, optional): タブグループ情報を含めるか（デフォルト: `true`）

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tabs": [
      {
        "uri": "file:///Users/username/project/src/index.ts",
        "label": "index.ts",
        "isActive": true,
        "isDirty": false,
        "groupIndex": 0,
        "index": 0
      },
      {
        "uri": "file:///Users/username/project/README.md",
        "label": "README.md",
        "isActive": false,
        "isDirty": true,
        "groupIndex": 0,
        "index": 1
      }
    ],
    "activeTabUri": "file:///Users/username/project/src/index.ts"
  },
  "id": 2
}
```

**Response Fields:**
- `tabs`: タブ情報の配列
  - `uri`: ファイルの URI（scheme 付き）
  - `label`: タブに表示されるラベル
  - `isActive`: 現在アクティブなタブか
  - `isDirty`: 未保存の変更があるか
  - `groupIndex`: タブグループのインデックス（0始まり）
  - `index`: グループ内でのタブのインデックス
- `activeTabUri`: 現在アクティブなタブの URI

**エラー:**
- `-32603`: Internal error（VSCode API エラー）

---

### Method: `tabs.close`

指定したタブを閉じる。

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tabs.close",
  "params": {
    "uri": "file:///Users/username/project/src/index.ts",
    "save": true
  },
  "id": 3
}
```

**Parameters:**
- `uri` (string, required): 閉じるタブの URI
- `save` (boolean, optional): 未保存変更を保存するか（デフォルト: `false`）

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "closed": true
  },
  "id": 3
}
```

**Response Fields:**
- `success`: 操作が成功したか
- `closed`: タブが閉じられたか（見つからない場合は `false`）

**エラー:**
- `-32602`: Invalid params（`uri` が不正）
- `-32603`: Internal error（VSCode API エラー）

**Example Error:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "reason": "uri is required"
    }
  },
  "id": 3
}
```

---

### Method: `tabs.closeMultiple` (nice to have)

複数のタブを一括で閉じる（REQ-3.3）。

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tabs.closeMultiple",
  "params": {
    "uris": [
      "file:///path/to/file1.ts",
      "file:///path/to/file2.ts"
    ],
    "save": true
  },
  "id": 4
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "results": [
      { "uri": "file:///path/to/file1.ts", "closed": true },
      { "uri": "file:///path/to/file2.ts", "closed": true }
    ]
  },
  "id": 4
}
```

## ディレクトリ構造

```
vcc-remote-control/
├── packages/
│   ├── vscode-extension/         # VSCode 拡張機能パッケージ
│   │   ├── src/
│   │   │   ├── extension.ts      # エントリーポイント
│   │   │   ├── ipc-server.ts     # IPC サーバー実装
│   │   │   ├── tab-manager.ts    # タブ操作の抽象化
│   │   │   ├── types.ts          # 型定義
│   │   │   └── handlers/         # JSON-RPC ハンドラー
│   │   │       ├── index.ts      # ハンドラーレジストリ
│   │   │       ├── ping-handler.ts
│   │   │       ├── tabs-list-handler.ts
│   │   │       └── tabs-close-handler.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── esbuild.js            # ビルド設定
│   │   └── README.md
│   │
│   └── client-lib/               # クライアントライブラリ（オプション）
│       ├── src/
│       │   ├── index.ts          # JSON-RPC クライアント
│       │   └── types.ts
│       ├── package.json
│       └── README.md
│
├── scripts/                      # 動作確認スクリプト（REQ-4.3）
│   ├── test-connection.ts        # 接続テスト
│   ├── list-tabs.ts              # タブ一覧取得テスト
│   └── close-tab.ts              # タブ閉じるテスト
│
├── docs/
│   ├── requirements/
│   │   └── milestone1-ipc-tabs.md
│   ├── design/
│   │   └── milestone1-ipc-tabs.md (this file)
│   └── development/
│       ├── setup.md              # セットアップ手順
│       └── testing.md            # テスト手順
│
├── .vscode/
│   └── launch.json               # デバッグ設定
│
├── package.json                  # ルートの monorepo 設定
└── README.md
```

## 実装計画

### Phase 1: 基盤構築（1-2日）

**目標**: 拡張機能が起動し、IPC サーバーが立ち上がる

1. プロジェクトセットアップ
   - `yo code` で vscode-extension パッケージを生成
   - TypeScript, esbuild 設定
   - package.json の `activationEvents` 設定

2. IPC サーバーの骨格実装
   - `net.createServer()` でソケット作成
   - 接続受付とログ出力
   - クリーンアップ処理（既存ソケットファイルの削除）

3. ping/pong の実装
   - JSON-RPC パーサー
   - `ping` メソッドハンドラー
   - レスポンス送信

**完了条件**:
- VSCode で拡張機能をロードできる
- `echo '{"jsonrpc":"2.0","method":"ping","id":1}' | nc -U ~/.vcc-remote-control/vcc.sock` で pong が返る

---

### Phase 2: タブ操作実装（2-3日）

**目標**: タブ一覧取得と閉じる機能が動作する

1. TabManager 実装
   - `vscode.window.tabGroups` API の調査
   - `listTabs()` メソッド実装
   - `closeTab()` メソッド実装

2. JSON-RPC ハンドラー実装
   - `tabs.list` ハンドラー
   - `tabs.close` ハンドラー
   - パラメータバリデーション
   - エラーハンドリング

3. 統合テスト
   - 複数タブを開いた状態でのテスト
   - ダーティタブ（未保存）のテスト
   - エッジケース（存在しない URI など）

**完了条件**:
- 外部スクリプトからタブ一覧を取得できる
- 外部スクリプトから特定のタブを閉じられる
- 未保存変更の save/discard が動作する

---

### Phase 3: 動作確認とドキュメント（1日）

**目標**: 誰でも動作確認できる状態にする

1. テストスクリプトの作成
   - `scripts/test-connection.ts`: 接続確認
   - `scripts/list-tabs.ts`: タブ一覧表示
   - `scripts/close-tab.ts`: タブを閉じる

2. ドキュメント整備
   - `docs/development/setup.md`: インストール手順
   - `docs/development/testing.md`: テスト手順
   - README.md の更新

3. 受け入れテスト
   - 要件定義書の受け入れ基準を確認
   - 各機能要件の動作確認

**完了条件**:
- README に従って第三者がインストールできる
- テストスクリプトで全機能の動作確認ができる
- 要件定義の受け入れ基準をすべて満たす

## セキュリティ考慮事項

### 1. ソケットファイルの権限

- Unix Socket ファイルのパーミッションを `600`（所有者のみ読み書き）に設定
- ディレクトリのパーミッションを `700` に設定
- 起動時に既存ソケットファイルを削除（stale socket 対策）

### 2. 入力検証

- JSON-RPC のスキーマ検証
- URI のフォーマット検証（スキーム確認）
- パラメータの型チェック

### 3. エラーメッセージ

- スタックトレースをクライアントに送信しない
- 内部エラーは汎化したメッセージにする

## エラーハンドリング

### JSON-RPC エラーコード

| Code | Message | 説明 |
|------|---------|------|
| -32700 | Parse error | JSON パースエラー |
| -32600 | Invalid Request | JSON-RPC フォーマットエラー |
| -32601 | Method not found | メソッドが存在しない |
| -32602 | Invalid params | パラメータが不正 |
| -32603 | Internal error | サーバー内部エラー |

### エラーレスポンス例

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "method": "unknown.method"
    }
  },
  "id": 1
}
```

### 拡張機能の障害分離（NFR-1.2）

- すべての非同期処理に try-catch
- エラーは VSCode のアウトプットパネルにログ
- 致命的エラーでもサーバーは停止しない（次の接続を受け付ける）

## テスト戦略

### 1. ユニットテスト

- TabManager の各メソッド
- JSON-RPC パーサー・ハンドラー
- エラーハンドリング

**ツール**: Jest または Mocha

### 2. 統合テスト

- 実際の VSCode 環境で拡張機能を起動
- 外部スクリプトから接続してテスト

**ツール**: VSCode Extension Test Runner

### 3. 手動テスト

- `scripts/` 配下のテストスクリプトを実行
- 様々なタブ状態（複数グループ、ダーティタブなど）で確認

## 依存関係

### vscode-extension パッケージ

**開発依存**:
```json
{
  "@types/node": "^20.x",
  "@types/vscode": "^1.85.0",
  "@vscode/test-electron": "^2.3.x",
  "esbuild": "^0.19.x",
  "typescript": "^5.3.x"
}
```

**ランタイム依存**:
- なし（Node.js 標準ライブラリのみ）

### client-lib パッケージ（オプション）

```json
{
  "@types/node": "^20.x",
  "typescript": "^5.3.x"
}
```

## パフォーマンス考慮

- タブ一覧取得は同期的に実行（高速）
- タブを閉じる操作は非同期（UIスレッドをブロックしない）
- 接続数に制限なし（OS のファイルディスクリプタ上限まで）

## 今後の拡張性

Milestone 2 以降で実装予定の機能との互換性を考慮:

- プラグインアーキテクチャ: ハンドラーを動的に追加できる設計
- イベント通知: タブの開閉イベントをクライアントに通知
- Copilot Chat 操作: 同じ IPC チャネルで拡張可能

## 参考資料

### VSCode API
- [TabGroups API](https://code.visualstudio.com/api/references/vscode-api#window.tabGroups)
- [Extension Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### IPC 実装
- [Node.js net module](https://nodejs.org/api/net.html)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

### ビルドツール
- [esbuild](https://esbuild.github.io/)
- [VSCode Extension Samples](https://github.com/microsoft/vscode-extension-samples)

---

**更新履歴**:
- 2024-04-02: 初版作成
