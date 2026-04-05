# multi-vscode-remote-control

複数の VSCode インスタンスを IPC 経由でリモートコントロールするためのツールキット。

## 概要

VSCode 拡張機能と IPC 通信を組み合わせて、外部プログラムから複数の VSCode を操作します。

### アーキテクチャ

- **daemon プロセス**: 単一の IPC socket (`~/.multi-vscode-remote-control/daemon.sock`) を提供
- **VSCode 拡張機能**: 各 VSCode ウィンドウから daemon に長寿命接続
- **外部クライアント**: daemon 経由で複数の VSCode ウィンドウを操作

詳細は [daemon アーキテクチャ設計](docs/design/daemon-simplification.md) を参照してください。

## 機能

### タブ操作

- **ping**: 接続確認
- **tabs.list**: 開いているタブの一覧を取得
- **tabs.close**: 指定したタブを閉じる

### チャット操作

- **chat.open**: VSCode のチャットパネルを開く
- **chat.newSession**: 新しいチャットセッションを開始する
- **chat.send**: チャットにプロンプトを送信する（`sync` オプションで応答完了まで待機可能）
- **chat.query**: 言語モデルに直接問い合わせ、レスポンス文字列を取得する
- **chat.status**: チャットの状態を取得する
  - 注意: `busy` は現在 `null` を返します（VSCode API 制限）。`chat.send` の `sync: true` を使用してください。

### ファイル操作

- **file.open**: 指定したパスのファイルをエディタで開く

### コマンド実行

- **command.execute**: VSCode コマンド ID を指定して任意のコマンドを実行する

### ウィンドウ操作

- **window.reload**: 現在の VSCode ウィンドウをリロードする
- **window.quit**: VSCode を終了する

## クイックスタート

### 1. ビルド

```bash
cd packages/vscode-extension
npm install
npm run build
```

### 2. 拡張機能をロード

VSCode でこのリポジトリを開き、F5 キーでデバッグ実行

### 3. 動作確認

```bash
cd scripts
python3 test-ping.py
python3 test-tabs-list.py
```

## 開発

開発については、CONTRIBUTING.md を必ず参照すること。

## ドキュメント

- [CONTRIBUTING.md](CONTRIBUTING.md) - 開発ガイド（必読）
- [docs/development/setup.md](docs/development/setup.md) - セットアップ手順
- [docs/development/testing.md](docs/development/testing.md) - テスト手順
- [docs/design/daemon-simplification.md](docs/design/daemon-simplification.md) - daemon アーキテクチャ設計
- [docs/design/milestone1-ipc-tabs.md](docs/design/milestone1-ipc-tabs.md) - タブ操作設計ドキュメント

## ライセンス

MIT
