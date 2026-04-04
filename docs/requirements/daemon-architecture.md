# daemon アーキテクチャ要件

> **📝 関連ドキュメント**
>
> このドキュメントは daemon の基本要件を定義しています。
> その後、アーキテクチャは簡素化されました（extension ごとの socket を廃止）。
> 詳細は [daemon-simplification.md](./daemon-simplification.md) を参照してください。

## 機能要件

### 1. daemon のシングルトン

- extension host が起動時に daemon の IPC socket の存在を確認できること。
- daemon が未起動の場合にのみ、extension host から daemon を spawn できること。
- daemon が既に起動している場合、新しい daemon を追加起動しないこと。
- IPC socket により、同一ユーザー環境で daemon が単一インスタンスとして動作できること。

### 2. daemon の受け口

- daemon が単一の IPC socket を listen して外部クライアントからのリクエストを受け取れること。
- daemon が extension host からの登録要求を受け取れること。

### 3. extension host 登録

- 各 extension host が起動時に daemon へ自身を登録できること。
- 各 extension host が終了時に daemon から自身を登録解除できること。
- daemon が現在登録されている extension host の一覧を保持できること。

### 4. ルーティング

- daemon が受け取ったリクエストを適切な extension host に転送できること。
- daemon が extension host からの応答をクライアントへ返却できること。

## 受け入れ基準

- 複数の VSCode ウィンドウを起動しても IPC socket の競合が発生しないこと。
- 後から起動したウィンドウによって既存ウィンドウの通信経路が破壊されないこと。
- daemon を停止した状態で extension host を起動すると daemon が起動し、通信できること。
- daemon 起動済みで別の extension host を起動しても daemon プロセスが増殖しないこと。
- daemon 経由で複数 extension host のいずれかへリクエストをルーティングできること。
