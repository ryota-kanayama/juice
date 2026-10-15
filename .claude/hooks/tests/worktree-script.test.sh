#!/bin/bash
# worktree スキルの実体(.claude/skills/worktree/scripts/wt.sh)の cleanup のテスト。
# フックではないが、消す操作を持つスクリプトなので同じ合成リポジトリの道具立てでここから走らせる。
# 作業ツリー・ブランチを消す前の安全確認を見る。create は終了コードだけを見る(list は見ない)。
#
# 検証の要は「確認に1つでも落ちたら何も消さない」。消す側より、止まる側を厚く刺す。
# gh は PATH 先頭の偽物に差し替え、マージ済み PR の有無と先端を環境変数で与える。
#
# 実行: bash .claude/hooks/tests/worktree-script.test.sh(依存: bash・jq・git)
set -u

here=$(cd "$(dirname "$0")" && pwd -P)
. "$here/lib.sh"
wt_sh="$here/../../skills/worktree/scripts/wt.sh"
require_jq
command -v git >/dev/null 2>&1 || { echo "git が見つかりません。" >&2; exit 1; }

tmp=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/worktree-script-test.XXXXXX")" && pwd -P)   # macOS の /var → /private/var を解決しておく
bg_pid=""
trap '[ -n "$bg_pid" ] && kill "$bg_pid" 2>/dev/null; rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
mkdir -p "$HOME" "$tmp/bin"
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid
git config --global init.defaultBranch main

# 偽の gh: `pr list --state merged` にだけ FAKE_GH_MERGED(JSON 1件)を返す
cat > "$tmp/bin/gh" <<'GH'
#!/bin/bash
case " $* " in *" pr list "*"--state merged"*) printf '%s' "${FAKE_GH_MERGED:-}" ;; esac
exit 0
GH
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"

out=""
rc=0
n=0

wt() { # <cwd> <引数...>
  local d="$1"; shift
  out=$(cd "$d" && bash "$wt_sh" "$@" 2>&1)
  rc=$?
}

merged() { export FAKE_GH_MERGED="{\"number\":1,\"headRefOid\":\"$1\",\"url\":\"https://example.invalid/pr/1\"}"; }

# 合成リポジトリ: bare の origin と、その clone。ブランチ feat の作業ツリーを切り、1コミット push する
mkrepo() {
  n=$((n + 1))
  repo="$tmp/r$n"
  git init --quiet --bare "$repo/origin.git"
  git clone --quiet "$repo/origin.git" "$repo/main" 2>/dev/null
  git -C "$repo/main" commit --quiet --allow-empty -m init
  git -C "$repo/main" push --quiet origin main
  git -C "$repo/main" remote set-head origin main >/dev/null
  wt "$repo/main" create feat
  feat="$repo/main/.claude/worktrees/feat"
  git -C "$feat" commit --quiet --allow-empty -m work
  git -C "$feat" push --quiet -u origin feat 2>/dev/null
  sha=$(git -C "$feat" rev-parse HEAD)
  unset FAKE_GH_MERGED
}

still_there() { # 何も消えていないこと(作業ツリー・ローカル・リモート)
  [ -d "$feat" ] && git -C "$repo/main" show-ref --quiet refs/heads/feat \
    && git -C "$repo/origin.git" show-ref --quiet refs/heads/feat
}

# --- create: 最後まで通る -----------------------------------------------------
# 完了メッセージで変数の直後に全角文字を置くと、bash 3.2 がそれを変数名の一部と読み、set -u で落ちていた
mkrepo
wt "$repo/main" create feat2
assert_exit_zero "create は完了メッセージまで出して 0 で終わる" "$rc"

# --- cleanup: 全部通れば3つとも消す -------------------------------------------
mkrepo; merged "$sha"
wt "$repo/main" cleanup feat
if [ "$rc" -eq 0 ] && [ ! -d "$feat" ] && ! git -C "$repo/main" show-ref --quiet refs/heads/feat \
  && ! git -C "$repo/origin.git" show-ref --quiet refs/heads/feat; then
  report ok "cleanup: マージ済みなら作業ツリー・ローカル・リモートを消す"
else report fail "cleanup: 消し残し(rc=$rc)$out"; fi

mkrepo; merged "$sha"
wt "$repo/main" cleanup --dry-run feat
if [ "$rc" -eq 0 ] && still_there; then report ok "cleanup --dry-run: 何も消さない"; else report fail "cleanup --dry-run: 消した"; fi

mkrepo; merged "$sha"
git -C "$repo/main" worktree remove "$feat"; git -C "$repo/main" branch --quiet -D feat
wt "$repo/main" cleanup feat
if [ "$rc" -eq 0 ] && ! git -C "$repo/origin.git" show-ref --quiet refs/heads/feat; then report ok "cleanup: リモートだけ残ったブランチも消す"; else report fail "cleanup: リモートだけの場合に消えない$out"; fi

# 確認を通った後、リモートを消すまでの間に誰かが push した。ローカルブランチの削除を合図に
# 別の clone から push させて窓を再現する(reference-transaction フックは ref の更新ごとに走る)
mkrepo; merged "$sha"
git clone --quiet "$repo/origin.git" "$repo/other" 2>/dev/null
git -C "$repo/other" switch --quiet feat
cat > "$repo/main/.git/hooks/reference-transaction" <<HOOK
#!/bin/bash
[ "\$1" = committed ] || exit 0
while read -r old new ref; do
  if [ "\$ref" = refs/heads/feat ] && [ "\$new" = 0000000000000000000000000000000000000000 ]; then
    git -C "$repo/other" commit --quiet --allow-empty -m race && git -C "$repo/other" push --quiet origin feat
  fi
done
exit 0
HOOK
chmod +x "$repo/main/.git/hooks/reference-transaction"
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && [ "$(git -C "$repo/origin.git" rev-parse feat 2>/dev/null)" = "$(git -C "$repo/other" rev-parse HEAD)" ]; then
  report ok "cleanup: 確認の後に push されたリモートブランチは消さない"
else report fail "cleanup: 確認の後の push ごとリモートブランチを消した(rc=$rc)"; fi

# --- cleanup: 止まる側 ---------------------------------------------------------
mkrepo
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: マージ済み PR が無ければ何も消さない"; else report fail "cleanup: PR 無しで消した"; fi

mkrepo; merged "$sha"
git -C "$feat" commit --quiet --allow-empty -m after-merge
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: マージ後に足したローカルコミットがあれば止まる"; else report fail "cleanup: 未マージのコミットごと消した"; fi

mkrepo; merged "$sha"
git -C "$repo/main" fetch --quiet origin
git clone --quiet "$repo/origin.git" "$repo/other" 2>/dev/null
git -C "$repo/other" switch --quiet feat && git -C "$repo/other" commit --quiet --allow-empty -m pushed-later && git -C "$repo/other" push --quiet origin feat
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: マージ後に誰かが push していれば止まる"; else report fail "cleanup: リモートの追加コミットごと消した"; fi

mkrepo; merged "$sha"
touch "$feat/untracked.txt"
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: 未追跡ファイルがあれば止まる"; else report fail "cleanup: 未追跡ファイルごと消した"; fi
assert_contains "cleanup: 未追跡ファイルを確認で拾う(git worktree remove の拒否任せにしない)" "$out" "NG  作業ツリー $feat に未コミットの変更か未追跡ファイルがあります"

mkrepo; merged "$sha"
wt "$feat" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: 対象の作業ツリーの中から呼ばれたら止まる"; else report fail "cleanup: 自分のいる作業ツリーを消した"; fi
assert_contains "cleanup: 作業ツリーの中から呼ばれたことを確認で拾う" "$out" "NG  この作業ツリーの中から呼ばれています"

if [ -d /proc/self ]; then
  mkrepo; merged "$sha"
  (cd "$feat" && exec sleep 30) & bg_pid=$!
  sleep 0.2
  wt "$repo/main" cleanup feat
  if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: 中で動いているプロセスがあれば止まる"; else report fail "cleanup: プロセスが居るのに消した"; fi
  kill "$bg_pid" 2>/dev/null; wait "$bg_pid" 2>/dev/null; bg_pid=""
fi

# 主作業ツリーで対象ブランチを使ったまま片付けようとした。主作業ツリーは消さず、切り替えを案内する
mkrepo; merged "$sha"
git -C "$repo/main" worktree remove "$feat"
git -C "$repo/main" switch --quiet feat
wt "$repo/main" cleanup feat
assert_contains "cleanup: 主作業ツリーが対象ブランチのままなら、既定ブランチへの切り替えを案内する" "$out" "NG  主作業ツリーが feat のままです(git switch main してから実行してください)"

# main を head とするマージ済み PR があっても、既定ブランチのガード単体で止まる
mkrepo; merged "$(git -C "$repo/main" rev-parse main)"
wt "$repo/main" cleanup main
assert_contains "cleanup: 既定ブランチは拒む" "$out" "既定ブランチ(main)は消しません"

mkrepo; merged "$sha"
mv "$repo/origin.git" "$repo/origin.moved"
wt "$repo/main" cleanup feat
mv "$repo/origin.moved" "$repo/origin.git"
assert_contains "cleanup: リモートを取得できなければ止まる" "$out" "NG  origin を取得できません"

mkrepo; merged "$sha"
git -C "$repo/main" remote set-head origin --delete
wt "$repo/main" cleanup feat
if [ "$rc" -ne 0 ] && still_there; then report ok "cleanup: 既定ブランチが分からなければ何も消さない"; else report fail "cleanup: 既定ブランチ不明のまま進んだ(rc=$rc)"; fi

test_summary
