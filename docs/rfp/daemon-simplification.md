# daemon アーキテクチャ簡素化

## 課題

- 現在は extension host ごとに独自 socket（`ext-{uuid}.sock`）を生成しており、設計が複雑になっている。
- human の指示は daemon 側に socket を設けることのみであり、extension host ごとの socket 追加は要求されていない。
- socket パス管理と到達性判定の責務が増え、運用・保守が複雑化している。

## したいこと

- daemon socket を 1 つだけ持つシンプルな構成にしたい。
- extension host は daemon へ長寿命接続するだけにしたい。
- daemon は接続そのものを保持してルーティングし、接続断時に自動的に登録解除できるようにしたい。
