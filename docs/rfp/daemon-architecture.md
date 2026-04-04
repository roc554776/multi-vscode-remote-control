# daemon アーキテクチャへの移行

> **📝 関連ドキュメント**
>
> このドキュメントは daemon の基本的な要望を定義しています。
> その後、アーキテクチャは簡素化されました（extension ごとの socket を廃止）。
> 詳細は [daemon-simplification.md](./daemon-simplification.md) を参照してください。

## 課題

- 現在は各 extension host が同じ IPC socket パス（`~/.vcc-remote-control/vcc.sock`）を使っているため、複数ウィンドウ起動時に競合が発生する。
- 後から起動したウィンドウが socket を上書きし、先に起動していたウィンドウへアクセスできなくなる。
- ウィンドウごとの登録状態を一元管理できず、安定したルーティングが難しい。

## したいこと

- vcc を daemon 方式に移行したい。
- extension host から daemon を spawn したい。
- IPC socket を使って daemon のシングルトンを実現したい。
- daemon が単一の IPC エンドポイントを listen し、複数 extension host の登録を受け付けたい。
- daemon が extension host へのリクエストルーティングを担当できるようにしたい。
