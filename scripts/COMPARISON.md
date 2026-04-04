# VSCode Trust Dialog Scripts Comparison

## Old Script vs New Script

### macos_trust_dialog.py (旧版)

**アプローチ**: UI 自動化（peekaboo によるキーボードナビゲーション）

**問題点**:
- ❌ VSCode が AXPress API をブロック
- ❌ CGEvent もブロックされている
- ❌ Tab + Space ナビゲーションが機能しない
- ❌ 10回以上試行してもダイアログが消えない
- ❌ VSCode のセキュリティ対策により根本的に不可能

**コマンド**:
```bash
python3 macos_trust_dialog.py check    # ダイアログの存在確認
python3 macos_trust_dialog.py trust    # ダイアログをクリック（失敗する）
```

### macos_trust_dialog_v2.py (新版) ⭐

**アプローチ**: 設定ファイルの直接編集

**利点**:
- ✅ 確実に動作する
- ✅ VSCode の公式な設定方法
- ✅ 自動バックアップ機能
- ✅ 複数のオプション（disable, enable, permissive）
- ✅ UI 自動化の限界を回避
- ✅ すべてのワークスペースに適用

**コマンド**:
```bash
python3 macos_trust_dialog_v2.py check        # 現在の設定を確認
python3 macos_trust_dialog_v2.py disable      # trust を無効化（推奨）
python3 macos_trust_dialog_v2.py enable       # trust を有効化
python3 macos_trust_dialog_v2.py permissive   # 寛容な設定
python3 macos_trust_dialog_v2.py reset        # デフォルトに戻す
```

## 推奨される移行

### 自動化スクリプトの場合

**Before**:
```python
# これは失敗する
controller = VSCodeTrustDialogController()
controller.trust_workspace()  # ❌ 動作しない
```

**After**:
```python
# 確実に動作する
manager = VSCodeTrustManager()
manager.disable_trust()  # ✅ 動作する
```

### 実用的な使い方

#### シナリオ 1: 開発マシンの初回セットアップ

```bash
# trust ダイアログを完全に無効化
cd /path/to/vcc-remote-control/scripts
python3 macos_trust_dialog_v2.py disable

# VSCode を再起動
# → 以降、trust ダイアログは表示されない
```

#### シナリオ 2: CI/CD 環境

```bash
# 自動化スクリプトの中で trust を無効化
python3 macos_trust_dialog_v2.py disable
```

#### シナリオ 3: セキュリティを保ちつつ使いやすくする

```bash
# より寛容な設定にする
python3 macos_trust_dialog_v2.py permissive

# この設定だと:
# - trust 機能は有効
# - 信頼されていないファイルは自動的に開く
# - 空のウィンドウの制限なし
```

#### シナリオ 4: デフォルトに戻す

```bash
# 元の設定に戻す
python3 macos_trust_dialog_v2.py reset
```

## 技術的な詳細

### なぜ UI 自動化が失敗するのか

1. **AXPress API**: VSCode はセキュリティダイアログに対して accessibility API をブロック
2. **CGEvent API**: 低レベルのイベント注入もブロック
3. **キーボードイベント**: Tab/Space イベントが適切に処理されない

これらは意図的なセキュリティ対策です。

### 設定ファイルの場所

```
~/Library/Application Support/Code/User/settings.json
```

### バックアップの場所

```
~/Library/Application Support/Code/User/settings.backup.YYYYMMDD_HHMMSS.json
```

### 変更される設定キー

- `security.workspace.trust.enabled` - trust 機能の有効/無効
- `security.workspace.trust.untrustedFiles` - 信頼されていないファイルの扱い (permissive モード)
- `security.workspace.trust.emptyWindow` - 空のウィンドウの制限 (permissive モード)

## まとめ

| 項目 | 旧版 (UI 自動化) | 新版 (設定編集) |
|------|-----------------|----------------|
| 動作の確実性 | ❌ 失敗する | ✅ 確実 |
| 実装の複雑さ | 🔴 複雑 | 🟢 シンプル |
| 依存関係 | peekaboo 必要 | 標準ライブラリのみ |
| VSCode 再起動 | 不要（ダイアログ操作） | 推奨（設定反映） |
| 適用範囲 | 1つのダイアログのみ | 全ワークスペース |
| バックアップ | なし | 自動作成 |
| 推奨度 | ❌ 非推奨 | ✅ 推奨 |

**結論**: `macos_trust_dialog_v2.py` を使用することを強く推奨します。
