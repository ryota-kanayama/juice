# hooks — レビュー強制フック

`.claude/settings.json` の `hooks` 節から呼ばれる。

依存: `bash`・`jq`(必須)、`git`(無ければ黙って無効になる)。
`jq` が無い環境ではレビュー強制のフックは**無音で素通し**する——フックの故障で作業を止めない方針(Fail-open)。

## フック一覧

| フック | イベント | すること | 止めるか |
| --- | --- | --- | --- |
| `impl-review-check.sh` | Stop | 未レビューのコード変更コミットがあれば停止をブロックし、`impl-review` を促す | コミットごと1回 |
| `enforce-squash-merge.sh` | PreToolUse(Bash) | `--squash` の無い `gh pr merge` を拒否する | 毎回 |

`impl-review-check.sh` の性質:

- **Fail-open**: 入力が壊れている・想定外の構成・依存が無い場合は `exit 0` で素通しする。
- **ロックアウトしない**: ブロックは「同じコミットにつき1セッション1回」。無視しても作業は進む。
- **スキル未導入なら無効**: `.claude/skills/impl-review/SKILL.md` が無ければ強制しない。
- **「コード」の判定は除外方式**: `*.md`・`docs`・`.claude` など文書・設定以外のすべてをコードとみなす。
- **既定ブランチ上では動かない**: 作業ブランチ(既定ブランチとの分岐点以降)だけが対象。
- **状態はセッション別**: 同一作業ツリーで複数セッションが動いても、片方のレビューがもう片方の検知を消さない。状態は `.claude/state/`(git管理外)。

## 調整するには

設定ファイルは持たない。「コード」から外すパス・列挙する最大件数・状態の保持日数は、`impl-review-check.sh` の冒頭の定数を直接書き換える。

## テスト

```bash
bash .claude/hooks/tests/run-all.sh
```

一時ディレクトリに合成リポジトリを作って検証する。実リポジトリの `.claude/state/` は書き換えない。
`worktree-script.test.sh` は `worktree` スキルの `wt.sh` のテスト。
