# Design: daemon アーキテクチャ簡素化

## 新アーキテクチャ

```
外部クライアント
   │ JSON-RPC
   ▼
daemon.sock ──> daemon
                 ├─ extension host 1 (長寿命接続)
                 ├─ extension host 2 (長寿命接続)
                 └─ extension host 3 (長寿命接続)
```

- daemon は socket を 1 つだけ listen する。
- extension host は daemon.sock に接続し、同一接続を維持する。
- daemon は extension host ごとの接続オブジェクトを registry で管理する。
- 接続 `close` を検知した時点で registry から自動削除する。

## 変更方針

### 削除するファイル

- `packages/vscode-extension/src/extension-ipc-server.ts`

### 変更するファイル

- `packages/vscode-extension/src/daemon-client.ts`
  - extension 側 IPC server の起動を廃止
  - daemon への長寿命接続を確立して register
  - unregister メッセージではなく接続断で登録解除
- `packages/daemon/src/daemon-server.ts`
  - register 時に socketPath ではなく接続ソケットを保持
  - 接続 close 時に自動 unregister
- `packages/daemon/src/router.ts`
  - socket パスへの都度接続ではなく、保持済み接続へ直接書き込み
- `packages/daemon/src/extension-registry.ts`
  - `socketPath` 管理を廃止し、`net.Socket` を保持
