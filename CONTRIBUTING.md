# Contributing Guide

## 開発手順

開発の詳細手順は `docs/development/*.md` を参照してください。

---

## 要望原文

プロジェクトの初期要望原文は以下のドキュメントを参照してください：
- [Initial Requirements](docs/raw-rfp/initial-requirements.md)

このドキュメントには、プロジェクトオーナーからの元の要求が記録されています。

## ドキュメント構成

ドキュメントは以下の4層構造で整理する:

```
docs/
├── raw-rfp/       # human 原文そのまま
├── rfp/           # 整理された要望（課題・欲しいもの）
├── requirements/  # 要件定義（仕様・受け入れ基準）
├── design/        # 実装方法（HOW）
└── development/   # 開発の方法に関するドキュメント
```

### 各層の役割と区別

| 層 | 役割 | 書くこと | 書かないこと |
|----|------|---------|-------------|
| **raw-rfp** | human の発言をそのまま記録 | 原文、逐語訳 | 解釈や整理 |
| **rfp** | 課題・欲しいものを整理 | 「〜したい」「〜が問題」 | 解決策（VSIX、GUI API 等） |
| **requirements** | 仕様・受け入れ基準を定義 | 「〜を満たすこと」「〜ができること」 | 実装方法の詳細 |
| **design** | 実装方法を記述 | アーキテクチャ図、技術選定、設計パターン | - |

**重要な区別:**
- **rfp** は「何が欲しいか」であり「何を使って解決するか」ではない
  - ✅ 「Copilot Chat を自動操作したい」「GUI操作を自動化したい」
  - ❌ 「VSIX で実装する」「GUI API を使う」（これは design）
- **requirements** は「何を満たすか」であり「どう実現するか」ではない
  - ✅ 「Copilot Chat にメッセージを送信できること」「チャット履歴を取得できること」
  - ❌ 「VSCode API で通信する」「accessibility API を使う」（これは design）

## 開発 Workflow

1. **raw-rfp**: human からの要望・原文を raw-rfp/ に記録する
2. **rfp**: raw-rfp の内容を整理して rfp/ にまとめる
3. **requirements**: rfp から要件を抽出して requirements/ に定義する
4. **実装**: 要件に基づいてコードを実装する
