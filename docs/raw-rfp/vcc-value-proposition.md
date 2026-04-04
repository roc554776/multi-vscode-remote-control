# raw-rfp: vcc remote control の価値について

> raw-rfp として以下を追加します。開発ワークフローを回してください。（実装ステップは省略）
>
> raw-rfp
> - vcc remote control の価値について
>   - vscode-remote-control があれば、 VSCode Copilot Chat の大半は remote control できますが、充分ではありません。
>   - vcc remote control は VSCode Copilot Chat との連携に特化します。
>   - vcc remote control は、拡張 + 専用 GUI クライアントによって、モバイルからも VSCode Copilot Chat を remote control できるようにします。
>   - VSCode Copilot Chat の内部実装、内部 API に踏み込んで、強力な操作を可能にします。安定性と強力なハックを両立します。
>     - 例えば、 VSCode Copilot Chat が表示させる GUI コンポーネントのリモート表示、リモート操作を可能にします。
>       - アイディアとして、表示されている GUI コンポーネントの構造を専用 GUI クライアントに再構築して、表示させることも考えられます。
