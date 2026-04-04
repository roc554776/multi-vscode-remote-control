# multi-vscode-remote-control Scripts

VSCode と VSCode 拡張機能を操作するための各種スクリプト集。

## スクリプト一覧

### 1. VSCode Database Editor (`edit_vscdb.py`)

VSCode の `state.vscdb` (SQLite データベース) を安全に編集するための汎用スクリプト。
VSCode を自動的に停止してから SQL を実行するため、データベースの破損を防ぎます。

#### 使い方

```bash
# データベースを検索
python3 edit_vscdb.py --sql "SELECT * FROM ItemTable LIMIT 10"

# データを更新
python3 edit_vscdb.py --sql "UPDATE ItemTable SET value = '{}' WHERE key = 'test'"

# カスタムパスのデータベースを操作
python3 edit_vscdb.py --sql "SELECT * FROM ItemTable" --db ~/custom/state.vscdb
```

#### 処理フロー

1. VSCode を停止（osascript で quit）
2. 最大10回（5秒間）待って、起動していないことを確認
3. まだ起動していたら force kill（kill -9）
4. 再度確認。起動していたら abort（exit 1）
5. state.vscdb に sqlite3 で接続
6. 指定の SQL を実行
7. SELECT 文の場合は結果を表示、UPDATE/INSERT 等の場合は影響行数を表示

#### 注意事項

⚠️ **このスクリプトなしでは `state.vscdb` を編集しないこと**
- VSCode 起動中にデータベースを編集するとデータが破損する可能性があります
- このスクリプトは VSCode の完全停止を保証します

---

### 2. Language Model Permission Grant (`grant-lm-permission.py`)

multi-vscode-remote-control 拡張機能に Copilot Chat の Language Model 使用権限を付与する専用スクリプト。

#### 使い方

```bash
python3 grant-lm-permission.py
```

---

### 3. macOS Trust Dialog Controller (`macos_trust_dialog.py`)

macOS Accessibility API を使用して VSCode の Workspace Trust ダイアログをプログラム的に操作します。

#### 必要条件

- **macOS**（このスクリプトはmacOS専用です）
- **Python 3.9+**
- **PyObjC**（自動インストールされます）
- **アクセシビリティ権限**

#### インストール

**依存関係のインストール**

```bash
pip3 install --user pyobjc-framework-ApplicationServices pyobjc-framework-Cocoa
```

または、PEP 723対応のツール（`uv`など）を使用：

```bash
uv run macos_trust_dialog.py --help
```

**アクセシビリティ権限の付与**

1. **システム環境設定** > **セキュリティとプライバシー** > **プライバシー** > **アクセシビリティ** を開く
2. 左下の鍵アイコンをクリックして変更を許可
3. **Terminal.app**（または使用中のターミナルアプリ）を追加してチェックを入れる
4. Python実行ファイルも必要に応じて追加

#### 使い方

**ダイアログの存在確認**

```bash
python3 macos_trust_dialog.py check
```

**出力例：**
```
✓ Workspace Trust dialog found
```
または
```
✗ Workspace Trust dialog not found
```

**Trust ボタンをクリック**

```bash
python3 macos_trust_dialog.py trust
```

**出力例：**
```
✓ Successfully clicked trust button
```

**デバッグモード**

詳細な診断情報を表示：

```bash
python3 macos_trust_dialog.py --debug check
python3 macos_trust_dialog.py --debug trust
```

#### トラブルシューティング

**エラー: "Accessibility permission may be required"**

アクセシビリティ権限が付与されていません。上記の「アクセシビリティ権限の付与」セクションを参照してください。

**エラー: "VSCode is not running"**

VSCode が起動していません。VSCode を起動してから再度実行してください。

**エラー: "Workspace Trust dialog not found"**

Trust ダイアログが表示されていません。以下を確認：
- VSCode が実際に Trust ダイアログを表示しているか
- ダイアログが他のウィンドウの背後に隠れていないか

**エラー: "PyObjC not installed"**

依存関係がインストールされていません：

```bash
pip3 install --user pyobjc-framework-ApplicationServices pyobjc-framework-Cocoa
```

#### 技術詳細

このスクリプトは以下の技術を使用しています：

- **ApplicationServices.AXUIElement** - macOS Accessibility API
- **Cocoa.NSRunningApplication** - 実行中のアプリケーションの検出
- 再帰的なUI要素のトラバース
- AXPress アクションによるボタンクリック

#### 制限事項

- macOS専用（Windows/Linuxでは動作しません）
- VSCodeの複数インスタンスが起動している場合、最初に見つかったものを使用
- アクセシビリティAPIが無効化されている場合は動作しません

---

## 共通要件

- **Python 3.9+**
- **macOS**（一部のスクリプトは macOS 専用）

## ライセンス

このスクリプトは自由に使用・改変できます。
