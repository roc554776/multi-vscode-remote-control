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

（将来的に追加予定）
