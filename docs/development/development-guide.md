# Development Guide

このドキュメントは開発者向けの情報を提供します。

## 開発環境のセットアップ

### 依存パッケージのインストール

```bash
npm install
```

### ビルド

```bash
cd packages/vscode-extension
npm run build
```

## 拡張機能の開発インストール

開発中の拡張機能を VSCode に強制インストールするには、`scripts/dev-install.py` を使用します。

### 使い方

```bash
python3 scripts/dev-install.py
```

このスクリプトは以下を自動実行します：

1. 拡張機能のビルド
2. VSIX パッケージの作成
3. VSCode の停止（起動中の場合）
4. 拡張機能の強制インストール

### 必要な環境

- Python 3.9+
- VSCode CLI が `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code` に存在すること（macOS）

### 注意事項

- VSCode が起動中の場合、自動的に停止されます
- 既存の拡張機能は `--force` オプションで上書きされます
