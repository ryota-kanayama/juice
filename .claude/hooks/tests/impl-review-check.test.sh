#!/bin/bash
# impl-review-check.sh(Stopフック)のテスト。
#
# 検証の要は3点:
#   (a) 未レビューのコード変更があるときだけ止める
#   (b) 既定ブランチの自動検出が main / master のどちらでも効く
#   (c) 「コード」の判定が言語に依存しない(除外以外はコード)
#
# 実行: bash .claude/hooks/tests/impl-review-check.test.sh(依存: bash・jq・git)
set -u

here=$(cd "$(dirname "$0")" && pwd -P)
. "$here/lib.sh"
hook="$here/../impl-review-check.sh"
require_jq
command -v git >/dev/null 2>&1 || { echo "git が見つかりません。impl-review-check はgit前提のためテストできません。" >&2; exit 1; }

tmp=$(mktemp -d "${TMPDIR:-/tmp}/impl-review-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
mkdir -p "$HOME"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid

stdout=""
hook_rc=0

stop() { # <プロジェクト> <セッションID> [stop_hook_active]
  local active="${3:-false}"
  stdout=$(printf '{"session_id":"%s","stop_hook_active":%s}' "$2" "$active" \
    | CLAUDE_PROJECT_DIR="$1" bash "$hook" 2>/dev/null)
  hook_rc=$?
}

reason() { printf '%s' "$1" | jq -r '.reason // empty' 2>/dev/null; }

mkrepo() { # <名前> <既定ブランチ名> — スキル入りの合成gitリポジトリを作る
  local p="$tmp/$1"
  mkdir -p "$p"
  git -C "$p" init -q -b "$2" >/dev/null 2>&1
  install_skill "$p" impl-review
  echo '# readme' > "$p/README.md"
  git -C "$p" add -A >/dev/null 2>&1
  git -C "$p" commit -qm "初期コミット" >/dev/null 2>&1
  printf '%s' "$p"
}

commit_file() { # <リポジトリ> <相対パス> <メッセージ>
  mkdir -p "$(dirname "$1/$2")"
  printf 'x\n' >> "$1/$2"
  git -C "$1" add -A >/dev/null 2>&1
  git -C "$1" commit -qm "$3" >/dev/null 2>&1
}

# --- ケース1: 作業ブランチの未レビューコード変更 → 止める ------------------------
repo=$(mkrepo r1 main)
git -C "$repo" checkout -qb feat-a
commit_file "$repo" "src/app.py" "機能を足す"
stop "$repo" "s1"
assert_exit_zero "ケース1: 終了コード0(JSONで停止を伝える)" "$hook_rc"
assert_contains "ケース1: ブロックする" "$stdout" '"block"'
assert_contains "ケース1: 対象コミットの件名を挙げる" "$(reason "$stdout")" "機能を足す"
assert_contains "ケース1: 比較元ブランチを本文に書く" "$(reason "$stdout")" "main"
stop "$repo" "s1"
assert_empty "ケース1: 同一セッションの2回目は止めない(ロックアウトしない)" "$stdout"

# --- ケース2: 別セッションでは再び止まる ----------------------------------------
stop "$repo" "s1-other"
assert_contains "ケース2: 通知はセッション別(他セッションでは再び止まる)" "$stdout" '"block"'

# --- ケース3: レビュー済み台帳に載ったコミットは止めない -------------------------
base=$(git -C "$repo" merge-base main HEAD)
git -C "$repo" rev-list "$base"..HEAD >> "$repo/.claude/state/impl-reviewed-commits"
stop "$repo" "s3"
assert_empty "ケース3: レビュー済みなら別セッションでも止めない" "$stdout"

# --- ケース4: 免除台帳に載ったコミットは止めない --------------------------------
repo=$(mkrepo r4 main)
git -C "$repo" checkout -qb feat-b
commit_file "$repo" "src/app.py" "免除されるコミット"
mkdir -p "$repo/.claude/state"
git -C "$repo" rev-list main..HEAD >> "$repo/.claude/state/impl-exempted-commits"
stop "$repo" "s4"
assert_empty "ケース4: 免除済みなら止めない" "$stdout"

# --- ケース5: 既定ブランチ上では止めない ----------------------------------------
repo=$(mkrepo r5 main)
commit_file "$repo" "src/app.py" "mainへの直接コミット"
stop "$repo" "s5"
assert_empty "ケース5: 既定ブランチ上では止めない" "$stdout"

# --- ケース6: 既定ブランチ名が master でも自動検出する(汎用化の要) --------------
repo=$(mkrepo r6 master)
git -C "$repo" checkout -qb feat-c
commit_file "$repo" "lib/thing.go" "masterリポジトリでの変更"
stop "$repo" "s6"
assert_contains "ケース6: masterを既定ブランチとして検出し止める" "$stdout" '"block"'
assert_contains "ケース6: 比較元がmasterであると本文に書く" "$(reason "$stdout")" "master"

# --- ケース7: 文書だけのコミットは止めない(doc-reviewの担当) --------------------
repo=$(mkrepo r7 main)
git -C "$repo" checkout -qb docs-only
commit_file "$repo" "docs/design.md" "設計文書だけ更新"
commit_file "$repo" "NOTES.md" "ルート直下のmdだけ更新"
stop "$repo" "s7"
assert_empty "ケース7: 文書だけのコミットでは止めない" "$stdout"

# --- ケース8: 言語を問わずコードとみなす(除外以外はコード) ----------------------
repo=$(mkrepo r8 main)
git -C "$repo" checkout -qb sql-change
commit_file "$repo" "migrations/0001_init.sql" "SQLだけの変更"
stop "$repo" "s8"
assert_contains "ケース8: src/が無いリポジトリのSQL変更でも止める" "$stdout" '"block"'

# --- ケース10: git管理外のディレクトリ → 素通し(汎用化の要) --------------------
plain="$tmp/plain"
mkdir -p "$plain/src"
install_skill "$plain" impl-review
stop "$plain" "s10"
assert_exit_zero "ケース10: git管理外でも終了コード0" "$hook_rc"
assert_empty "ケース10: git管理外では止めない" "$stdout"

# --- ケース11: スキル未導入なら強制しない ---------------------------------------
repo=$(mkrepo r11 main)
rm -rf "$repo/.claude/skills/impl-review"
git -C "$repo" checkout -qb feat-d
commit_file "$repo" "src/app.py" "スキル未導入リポジトリの変更"
stop "$repo" "s11"
assert_empty "ケース11: impl-reviewスキルが無いリポジトリでは止めない" "$stdout"

# --- ケース12: stop_hook_active・壊れた入力 → 素通し(Fail-open) ----------------
repo=$(mkrepo r12 main)
git -C "$repo" checkout -qb feat-e
commit_file "$repo" "src/app.py" "ループ防止の確認"
stop "$repo" "s12" true
assert_empty "ケース12: フック起因の継続中は無音" "$stdout"
stdout=$(printf '%s' '{not json' | CLAUDE_PROJECT_DIR="$repo" bash "$hook" 2>/dev/null)
hook_rc=$?
assert_exit_zero "ケース12: 壊れたJSONでも終了コード0" "$hook_rc"
assert_empty "ケース12: 壊れたJSONは無音" "$stdout"

test_summary
