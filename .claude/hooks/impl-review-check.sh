#!/bin/bash
# Stopフック: 作業ブランチにレビュー未実施のコード変更がコミットされていたら停止をブロックし、
# impl-review スキルを促す。
#
# 「コード」= 除外パターン(下の EXCLUDES)に当たらないすべてのファイル。文書・設定以外はコード。
#
# 状態を3種類に分ける(置き場は .claude/state/。git管理外):
#   impl-reviewed-commits  … 実際にレビューしたコミット(共有・追記のみ)
#   impl-exempted-commits  … ユーザーが免除したコミット(共有・追記のみ)
#   impl-notified-<sid>    … このセッションへ通知済み(ロックアウト防止・セッション別)
#
# 「レビュー済み地点」を指すポインタをブロックの副作用で前進させる方式は使わない。
#   (a) 通知を無視すれば未レビューのまま緑になる
#   (b) 同一作業ツリーの他セッションのゲートまで消費する
# の2つの穴があるため。レビュー済みの記録はレビューを実行した者だけが追記する。
#
# Fail-open: jq や git が無い・入力が壊れている・想定外の構成では黙って exit 0 する。
# フックの故障で作業が止まる方が、検知漏れより高くつくため。
#
# 例外: git管理外 / コード変更なし / 既定ブランチ / ユーザー免除(スキルの例外手順)。
# ループ防止: フック起因の継続中(stop_hook_active)は素通しする。

# コードから外すパス(gitのpathspec)
EXCLUDES=(
  '*.md' '*.txt' 'docs' '.claude' 'LICENSE*' 'CHANGELOG*' '.gitignore' '.github/ISSUE_TEMPLATE'
)
MAX_LISTED=20      # ブロック時に列挙するコミットの最大数
RETENTION_DAYS=14  # セッション別の通知記録を残す日数

input=$(cat)

command -v jq >/dev/null 2>&1 || exit 0
command -v git >/dev/null 2>&1 || exit 0

if printf '%s' "$input" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[ -f .claude/skills/impl-review/SKILL.md ] || exit 0   # スキルが無ければ強制しない

# 既定ブランチ・detached HEADは対象外。既定ブランチは origin/HEAD、無ければ main / master。
branch=$(git branch --show-current 2>/dev/null)
[ -z "$branch" ] && exit 0
default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
default_branch=${default_branch#origin/}
if [ -z "$default_branch" ]; then
  for b in main master; do
    if git show-ref --verify --quiet "refs/remotes/origin/$b" || git show-ref --verify --quiet "refs/heads/$b"; then
      default_branch=$b
      break
    fi
  done
fi
[ -z "$default_branch" ] && exit 0
[ "$branch" = "$default_branch" ] && exit 0

base=$(git merge-base "origin/$default_branch" HEAD 2>/dev/null || git merge-base "$default_branch" HEAD 2>/dev/null)
[ -z "$base" ] && exit 0

# セッションIDはファイル名に使うので、英数・ハイフン・アンダースコアだけに削る。
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
[ -z "$sid" ] && exit 0

state_dir=.claude/state
mkdir -p "$state_dir" 2>/dev/null || exit 0
reviewed="$state_dir/impl-reviewed-commits"
exempted="$state_dir/impl-exempted-commits"
notified="$state_dir/impl-notified-$sid"
touch "$reviewed" "$exempted" "$notified" 2>/dev/null || exit 0

# 古いセッションの通知記録を掃除する。1日1回だけ走らせる(毎回 find すると遅い)。
stamp="$state_dir/.last-prune"
if [ ! -f "$stamp" ] || [ -n "$(find "$stamp" -mtime +1 2>/dev/null)" ]; then
  find "$state_dir" -maxdepth 1 -type f -name 'impl-notified-*' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null
  : > "$stamp" 2>/dev/null
fi

# 対象パスの pathspec: リポジトリ全体 − 除外
pathspec=(":/")
for p in "${EXCLUDES[@]}"; do
  pathspec+=(":(top,exclude)$p")
done

# base..HEAD のうちコードを触るコミットで、まだ誰もレビューしておらず、
# このセッションにも未通知のものを集める
pending=$(git rev-list "$base"..HEAD -- "${pathspec[@]}" 2>/dev/null | while IFS= read -r sha; do
  [ -z "$sha" ] && continue
  grep -qxF "$sha" "$reviewed" && continue
  grep -qxF "$sha" "$exempted" && continue
  grep -qxF "$sha" "$notified" && continue
  printf '%s\n' "$sha"
done)

if [ -n "$pending" ]; then
  # 通知済みとして記録する(同じコミットで無限にブロックしない)。
  # レビュー済みにはしない——それはimpl-reviewスキルが実行後に追記する。
  printf '%s\n' "$pending" >> "$notified"
  list=$(printf '%s\n' "$pending" | while IFS= read -r sha; do
    [ -n "$sha" ] && git log -1 --format='%h %s' "$sha" 2>/dev/null
  done | head -n "$MAX_LISTED")
  jq -n --arg c "$list" --arg b "$default_branch" '{"decision":"block","reason":("レビュー未実施のコード変更コミットがあります(" + $b + " からの差分)。impl-review スキルを実行してから完了してください(ユーザーがレビュー不要と明示した場合はスキルの例外手順に従う)。対象コミット:\n" + $c)}'
fi
exit 0
