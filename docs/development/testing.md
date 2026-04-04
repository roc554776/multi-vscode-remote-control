# テスト手順

## 受け入れテスト

Milestone 1 の受け入れ基準を確認するための手順です。

### 準備

1. VSCode を起動し、拡張機能をロード（F5 でデバッグ実行）
2. いくつかのファイルを開いておく
3. 1つのファイルを編集して未保存状態にする

### テスト1: 接続確認

```bash
cd scripts
python3 test-ping.py
```

**期待結果**: `✅ Pong received!` と表示される

### テスト2: タブ一覧取得

```bash
python3 test-tabs-list.py
```

**期待結果**:
- 開いているタブの一覧が表示される
- 各タブの URI、ラベル、状態（ACTIVE/DIRTY）が確認できる

### テスト3: タブを閉じる（保存なし）

1. 新しいファイルを開く
2. タブ一覧で URI を確認
3. タブを閉じる

```bash
python3 test-tabs-close.py "file:///path/to/newfile.ts"
```

**期待結果**: `✅ Tab closed successfully` と表示される

### テスト4: タブを閉じる（保存あり）

1. ファイルを編集して未保存状態にする
2. `--save` オプション付きでタブを閉じる

```bash
python3 test-tabs-close.py "file:///path/to/editedfile.ts" --save
```

**期待結果**:
- ファイルが保存される
- タブが閉じられる

### テスト5: 存在しないタブを閉じる

```bash
python3 test-tabs-close.py "file:///nonexistent/file.ts"
```

**期待結果**: `⚠️ Tab not found` と表示される

## 自動テスト

プロジェクトには以下の自動テストが含まれています。

### E2E テスト

VSCode 拡張機能と Daemon の統合テストが実装されています。

#### テスト構成

- **VSCode Extension E2E**: vitest + @vscode/test-electron を使用
  - 拡張機能のアクティベーション確認
  - Daemon ソケットの作成確認
  - `packages/vscode-extension/src/test/suite/extension.test.ts`

- **Daemon E2E**: node:test を使用
  - Daemon サーバーの起動と接続
  - Extension Host の登録と JSON-RPC 通信
  - ラウンドロビン機能の検証
  - エラーハンドリングのテスト
  - `packages/daemon/src/__tests__/e2e/daemon-e2e.test.ts`

#### 実行方法

```bash
# VSCode Extension の E2E テスト
cd packages/vscode-extension
npm run test:e2e

# Daemon の E2E テスト
cd packages/daemon
npm test

# ワークスペース全体のテスト実行
cd /path/to/multi-vscode-remote-control
npm test
```

#### CI/CD について

現在、このリポジトリは private のため GitHub Actions は設定していません。
テストはローカル環境で実行してください。
