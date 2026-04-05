# コード品質ガイド

このドキュメントは、lint と TypeScript の型安全性に関する開発ルールをまとめたものです。

## Lint の実行

拡張機能パッケージ配下で以下を実行してください。

```bash
cd packages/vscode-extension
npm run lint
```

## TypeScript 厳格チェック

このプロジェクトでは TypeScript の厳格な型チェックを前提にしています。

- `@typescript-eslint/no-unsafe-*` ルールを有効化
- `any`/`unknown` の値を使う際は必ず型を絞り込んでから利用

## 型アサーション（`as`）禁止

以下は原則禁止です。

- `as TypeName`
- `as unknown as TypeName`
- `!`（non-null assertion）

実行時検証または型ガードで安全に型を絞り込んでください。

## 推奨する型ガード

### 1. zod（推奨）

外部入力や IPC レスポンスなど、実行時に保証されない値には `zod` を使って検証してください。

- `schema.safeParse(value)` で妥当性を確認
- 成功時のみ `result.data` を使う

### 2. `instanceof`

クラスインスタンスを判定する場合に使用します。

```ts
if (error instanceof Error) {
  logger.error(error.message);
}
```

### 3. `in` 演算子

オブジェクトのプロパティ有無で union 型を絞り込みます。

```ts
if ("tabId" in payload) {
  // payload は tabId を持つ型に絞り込まれる
}
```
