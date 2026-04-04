# daemon アーキテクチャ簡素化 要件

## 機能要件

1. daemon は IPC socket を 1 つ（`daemon.sock`）のみ提供すること。
2. extension host は独自 IPC socket を作成しないこと。
3. extension host は daemon へ長寿命接続を確立し、接続維持によって登録状態を表現すること。
4. daemon は extension host ごとに接続オブジェクトを保持し、外部クライアントからの JSON-RPC を接続先へ転送できること。
5. extension host との接続が切断された場合、daemon は該当 extension host を自動的に登録解除すること。

## 受け入れ基準

- `ext-*.sock` が生成されないこと。
- 複数 extension host が同時接続している状態で、daemon が各接続へリクエストをルーティングできること。
- extension host を終了（または接続断）すると、daemon 側の登録情報から自動的に除外されること。
