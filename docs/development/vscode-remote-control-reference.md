# vscode-remote-control リファレンス

## 概要

**vscode-remote-control** は Elio Struyf 氏が開発した VSCode 拡張機能で、WebSocket 経由で VSCode を外部からリモートコントロールできる。本ドキュメントでは、vcc-remote-control の開発における参考情報として vscode-remote-control の技術実装を解説する。

- **リポジトリ**: https://github.com/estruyf/vscode-remote-control
- **作者**: Elio Struyf
- **ライセンス**: MIT
- **主要言語**: TypeScript
- **最新バージョン**: v1.9.0 (調査時点)

## 主要機能

### 1. WebSocket サーバー

- HTTP サーバー上に WebSocket サーバーを構築
- デフォルトポート: `3710`
- デフォルトホスト: `127.0.0.1` (ローカルホストのみ)
- フォールバックポート機能で複数 VSCode インスタンス対応

### 2. コマンド実行

VSCode の任意のコマンドを外部から実行可能:

- **ファイル操作**: `vscode.open`, `vscode.openFolder`
- **エディタ操作**: すべての VSCode コマンド（コマンドパレットで利用可能なもの）
- **ターミナル操作**: `terminal.execute` でアクティブターミナルにテキスト送信
- **プレビュー表示**: `markdown.showPreview` など

### 3. 設定オプション

| 設定キー | デフォルト | 説明 |
|---------|-----------|------|
| `remoteControl.enable` | `true` | 拡張機能の有効/無効 |
| `remoteControl.port` | `3710` | WebSocket サーバーのポート |
| `remoteControl.host` | `127.0.0.1` | バインドするホスト |
| `remoteControl.fallbacks` | `[]` | フォールバックポート一覧 |
| `remoteControl.onlyWhenInFocus` | `false` | VSCode フォーカス時のみ実行 |
| `remoteControl.noAutoFallback` | `false` | フォールバック無効化 |

## アーキテクチャ

### システム構成

```
External Client (CLI, Script, etc.)
          ↓ WebSocket (JSON)
    HTTP Server (Node.js)
          ↓ HTTP Upgrade
    WebSocket Server (ws)
          ↓ Message Parse
    Command Processing
          ↓
    vscode.commands.executeCommand()
          ↓
    VS Code API
```

### 技術スタック

- **言語**: TypeScript
- **ランタイム**: Node.js
- **主要ライブラリ**:
  - `ws`: WebSocket サーバー実装
  - `tcp-port-used`: ポート使用状況チェック
- **ビルドツール**: webpack
- **VSCode API**: Extension API, Commands API

## コード構造

### ファイル構成

```
src/
├── extension.ts              # メインエントリーポイント (223行)
├── models/
│   └── CommandData.ts        # コマンドデータ型定義 (4行)
└── services/
    └── Logger.ts             # ロギング機能 (34行)

package.json                   # 拡張機能のメタデータ
tsconfig.json                  # TypeScript 設定
webpack.config.js              # ビルド設定
```

### 主要ファイル詳細

#### extension.ts

**activate() フロー**:

```typescript
// 1. Logger 初期化
Logger.init("Remote Control");

// 2. 設定読み込み
const config = vscode.workspace.getConfiguration("remoteControl");
const enabled = config.get<boolean>("enable", true);
const port = config.get<number>("port", 3710);
const host = config.get<string>("host", "127.0.0.1");

// 3. WebSocket サーバー起動
await startWebsocketServer();

// 4. ステータスバー表示
statusBarItem = vscode.window.createStatusBarItem();
statusBarItem.text = `$(radio-tower) Remote Control: ${port}`;
statusBarItem.show();

// 5. コマンド登録
context.subscriptions.push(
  vscode.commands.registerCommand("remoteControl.start", startWebsocketServer),
  vscode.commands.registerCommand("remoteControl.stop", stopWebsocketServer),
  vscode.commands.registerCommand("remoteControl.openSettings", openSettings)
);
```

**WebSocket サーバー起動**:

```typescript
// HTTP サーバー作成
const server = http.createServer();

// WebSocket サーバー作成 (noServer mode)
wss = new WebSocket.Server({ noServer: true });

// HTTP Upgrade ハンドラ
server.on("upgrade", function upgrade(request, socket, head) {
  wss?.handleUpgrade(request, socket, head, function done(ws) {
    wss?.emit("connection", ws, request);
  });
});

// リッスン開始
server.listen(port, host);
```

**メッセージ処理**:

```typescript
wss?.on("connection", (ws) => {
  ws.on("message", async (msg) => {
    // Focus チェック (オプション)
    if (onlyWhenInFocus && !vscode.window.state.focused) {
      return;
    }

    // JSON パース
    let data: CommandData | undefined;
    try {
      data = JSON.parse(msg.toString());
    } catch (e) {
      Logger.error(`Failed to parse message: ${msg.toString()}`);
      return;
    }

    // 特殊コマンド処理
    if (data.command === "vscode.open" || data.command === "vscode.openFolder") {
      data.args = [vscode.Uri.file(data.args)];
    }

    if (data.command === "terminal.execute") {
      const terminal = vscode.window.activeTerminal;
      terminal?.sendText(data.args, false);
      return;
    }

    // コマンド実行
    try {
      const result = Array.isArray(data.args)
        ? await vscode.commands.executeCommand(data.command, ...data.args)
        : await vscode.commands.executeCommand(data.command, data.args);

      ws.send(JSON.stringify({ result }));
    } catch (error) {
      Logger.error(`Failed to execute command: ${data.command}`, error);
      vscode.window.showErrorMessage(`Failed to execute command: ${data.command}`);
      ws.send(JSON.stringify({ error: error.message }));
    }
  });
});
```

#### CommandData.ts

```typescript
export interface CommandData {
  command: string;  // VSCode コマンド ID
  args?: any;       // コマンド引数（オプショナル）
}
```

#### Logger.ts

```typescript
export class Logger {
  private static instance: vscode.OutputChannel;

  static init(name: string) {
    Logger.instance = vscode.window.createOutputChannel(name);
  }

  static info(message: string) {
    const timestamp = new Date().toISOString();
    Logger.instance?.appendLine(`[${timestamp}] INFO: ${message}`);
  }

  static warning(message: string) {
    const timestamp = new Date().toISOString();
    Logger.instance?.appendLine(`[${timestamp}] WARNING: ${message}`);
  }

  static error(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    Logger.instance?.appendLine(`[${timestamp}] ERROR: ${message}`);
    if (error) {
      Logger.instance?.appendLine(JSON.stringify(error, null, 2));
    }
  }
}
```

## vcc-remote-control での活用方法

### 参考になる実装パターン

#### 1. **拡張機能のライフサイクル管理**

vscode-remote-control では `activate()` / `deactivate()` で明確にリソース管理を行っている:

- ✅ activate 時にサーバー起動・コマンド登録
- ✅ deactivate 時にサーバー停止・リソース解放
- ✅ `context.subscriptions` にリソースを登録

**vcc への適用**:
- IPC サーバーのライフサイクル管理に同様のパターンを適用
- `context.subscriptions.push(server)` でクリーンアップを保証

#### 2. **ポート管理のロジック**

vscode-remote-control のフォールバックポート機能は参考になる:

```typescript
// 1. メインポートをチェック
if (await tcpPortUsed.check(port, host)) {
  // 2. フォールバックポートを順次試行
  for (const fallbackPort of fallbacks) {
    if (!(await tcpPortUsed.check(fallbackPort, host))) {
      port = fallbackPort;
      break;
    }
  }
}

// 3. 環境変数に設定
process.env.REMOTE_CONTROL_PORT = port.toString();

// 4. ステータスバーに表示
statusBarItem.text = `$(radio-tower) Remote Control: ${port}`;
```

**vcc への適用**:
- Unix Socket のパス競合検出に応用
- 複数 VSCode インスタンスで異なるソケットパスを使用
- 環境変数でソケットパスを共有

#### 3. **エラーハンドリング**

vscode-remote-control のエラーハンドリングは簡潔で実用的:

- ✅ JSON パースエラー: ログ出力のみ（クライアントに返さない）
- ✅ コマンド実行エラー: ログ + ユーザー通知 + クライアントにエラー返却
- ✅ サーバー起動エラー: ログ + フォールバック試行

**vcc への適用**:
- JSON-RPC のエラーレスポンスで同様の分類を実装
- ログレベルを適切に設定（INFO / WARNING / ERROR）

#### 4. **ロギング機能**

Logger クラスの Singleton パターンは参考になる:

- ✅ Output Channel を使った VSCode ネイティブなログ出力
- ✅ タイムスタンプ付きログ
- ✅ エラーオブジェクトの JSON 出力

**vcc への適用**:
- 同様の Logger クラスを実装
- IPC 通信のデバッグ情報をログ出力

#### 5. **TypeScript の型安全性**

CommandData インターフェースでメッセージ型を定義:

```typescript
export interface CommandData {
  command: string;
  args?: any;
}
```

**vcc への適用**:
- JSON-RPC リクエスト/レスポンスの型定義を作成
- `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError` など

### 再利用できそうな部分

#### 1. **Logger クラス**

ほぼそのまま流用可能:

```typescript
// vcc-remote-control/packages/vscode-extension/src/utils/Logger.ts
export class Logger {
  // vscode-remote-control の Logger.ts をそのまま使用
}
```

#### 2. **設定管理パターン**

```typescript
// 設定の読み込み
const config = vscode.workspace.getConfiguration("vccRemoteControl");
const socketPath = config.get<string>("socketPath", "~/.vcc-remote-control/vcc.sock");
const autoStart = config.get<boolean>("autoStart", true);
```

#### 3. **ステータスバー表示**

```typescript
// ステータスバーアイテムの作成
statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);
statusBarItem.text = "$(radio-tower) VCC: Ready";
statusBarItem.tooltip = "VSCode Copilot Chat Remote Control";
statusBarItem.command = "vccRemoteControl.showInfo";
statusBarItem.show();
```

### 差別化ポイント（vcc は Copilot Chat 特化）

#### 1. **通信方式の違い**

| 項目 | vscode-remote-control | vcc-remote-control |
|------|----------------------|-------------------|
| **プロトコル** | WebSocket | Unix Socket / Named Pipe |
| **メッセージ形式** | JSON (独自) | JSON-RPC 2.0 |
| **ポート** | TCP 3710 | Socket ファイル |
| **認証** | なし | なし（ファイル権限で保護） |
| **マルチインスタンス** | フォールバックポート | Socket パスのサフィックス |

**vcc の利点**:
- ✅ ポート競合がない
- ✅ ファイルシステムベースで管理しやすい
- ✅ TCP よりオーバーヘッドが小さい
- ✅ JSON-RPC で標準化されたエラーハンドリング

**vscode-remote-control の利点**:
- ✅ WebSocket で双方向通信が容易
- ✅ リモートホストからの接続も可能（設定次第）
- ✅ HTTP ベースなので既存ツールとの連携が容易

#### 2. **対象 API の違い**

| 項目 | vscode-remote-control | vcc-remote-control |
|------|----------------------|-------------------|
| **対象** | すべての VSCode コマンド | Copilot Chat API 特化 |
| **ファイル操作** | `vscode.open` 等を直接実行 | タブ API 経由 |
| **ターミナル** | `terminal.execute` | （未実装） |
| **Copilot Chat** | （未対応） | Milestone 2 で実装予定 |

**vcc の特化機能**:
- ✅ タブの詳細情報取得 (`tabs.list`)
- ✅ タブの close 操作 (`tabs.close`)
- ✅ Copilot Chat への質問送信（Milestone 2）
- ✅ Copilot Chat の応答取得（Milestone 2）

#### 3. **設計思想の違い**

**vscode-remote-control**:
- 汎用的な VSCode リモートコントロール
- すべてのコマンドを実行可能
- シンプルな実装（223行の extension.ts）
- ユーザーが任意のコマンドを指定

**vcc-remote-control**:
- Copilot Chat 専用のコントロール
- 必要な API のみを公開
- JSON-RPC で明確な API 定義
- クライアントライブラリで抽象化

### 実装上の教訓

#### 1. **シンプルさの重要性**

vscode-remote-control は非常にシンプル（約260行のコード）だが、十分に機能する。vcc も同様にシンプルさを保つべき。

#### 2. **エラーハンドリングの重要性**

vscode-remote-control は各段階でエラーをキャッチし、適切にログ出力している。vcc も同様に:

- JSON パースエラー
- コマンド実行エラー
- サーバー起動エラー

を明確に区別してハンドリングする。

#### 3. **設定の柔軟性**

vscode-remote-control は多くの設定オプションを提供している:

- `enable`: 機能の有効/無効
- `port` / `host`: サーバー設定
- `fallbacks`: フォールバックポート
- `onlyWhenInFocus`: フォーカス制御
- `noAutoFallback`: フォールバック無効化

vcc も同様に、ユーザーが必要に応じてカスタマイズできるように設計する。

#### 4. **ステータスバーでの可視化**

vscode-remote-control はステータスバーにサーバーのポート番号を表示している。これはデバッグ時に非常に有用。

vcc も同様に:

```typescript
statusBarItem.text = "$(radio-tower) VCC: ~/.vcc-remote-control/vcc.sock";
```

のように、Socket パスや接続状態を表示する。

#### 5. **activation events の選択**

vscode-remote-control は `onStartupFinished` を使用している。これにより:

- ✅ VSCode 起動直後にアクティベート
- ✅ 他の拡張機能の起動を妨げない
- ✅ ユーザーが拡張機能を意識する必要がない

vcc も同じ activation event を使用すべき（既に実装済み）。

## 参考リソース

- **GitHub リポジトリ**: https://github.com/estruyf/vscode-remote-control
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=eliostruyf.vscode-remote-control
- **ブログ記事**: https://www.eliostruyf.com/remotely-control-visual-studio-code/
- **ws ライブラリ**: https://github.com/websockets/ws
- **tcp-port-used**: https://github.com/stdarg/tcp-port-used

## まとめ

vscode-remote-control は vcc-remote-control の開発において非常に有用なリファレンス実装である:

- ✅ **拡張機能のライフサイクル管理**: activate/deactivate のパターンを踏襲
- ✅ **エラーハンドリング**: 段階的なエラー処理を参考にする
- ✅ **ロギング**: Logger クラスをそのまま流用
- ✅ **設定管理**: workspace.getConfiguration() のパターンを使用
- ✅ **ステータスバー**: 接続状態の可視化

ただし、vcc-remote-control は Copilot Chat 特化であり、通信方式やプロトコルが異なるため、直接のコードコピーではなく、設計思想とパターンを参考にすることが重要である。
