# セットアップガイド

## 前提条件

- Node.js 20.x 以上
- VSCode 1.85.0 以上
- Python 3.9 以上（動作確認スクリプト用）

## 拡張機能のビルド

1. 依存関係のインストール

```bash
cd packages/vscode-extension
npm install
```

2. ビルド

```bash
npm run build
```

3. lint の実行

```bash
npm run lint
```

コード品質ルール（TypeScript 厳格チェック、`as` 禁止、型ガード方針）は
[コード品質ガイド](./code-quality.md) を参照してください。

## 拡張機能の更新を VSCode に反映する方法

拡張機能を更新して VSCode に反映する際は、**必ず** `scripts/reload-extension.py` を使用してください。  
詳細な手順と背景は [拡張機能の開発ガイド](./extension-development.md) を参照してください。

```bash
cd /path/to/vcc-remote-control
python3 scripts/reload-extension.py
```

## 拡張機能のインストール（開発モード）

### 方法1: デバッグ実行

1. VSCode でこのリポジトリを開く
2. F5 キーを押す（または「Run and Debug」→「Run Extension」）
3. 新しい VSCode ウィンドウが開き、拡張機能がロードされる

## 動作確認

拡張機能がロードされると、IPC サーバーが自動的に起動します。

出力パネル（View → Output）で「VCC Remote Control」チャンネルを選択すると、ログを確認できます。

### ping テスト

```bash
cd scripts
python3 test-ping.py
```

成功すると以下のように表示されます:

```
Testing ping...
✅ Pong received!
   Message: pong
   Timestamp: 1234567890
```

### タブ一覧取得

```bash
python3 test-tabs-list.py
```

### タブを閉じる

```bash
python3 test-tabs-close.py "file:///path/to/file.ts"
python3 test-tabs-close.py "file:///path/to/file.ts" --save
```
