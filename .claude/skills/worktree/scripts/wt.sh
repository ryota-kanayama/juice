#!/bin/bash
# worktree スキルの実体。作業ツリーの作成・一覧・後始末を、安全確認つきで行う。
#
#   wt.sh create <branch>             既定ブランチの最新から .claude/worktrees/<branch> を切る
#   wt.sh list                        作業ツリー・ローカル/リモートのブランチと PR の状態を並べる
#   wt.sh cleanup [--dry-run] <branch>
#                                     マージ済みを確かめてから、作業ツリー・ローカル/リモートのブランチを消す
#
# cleanup は「確認をすべて通ってから消す」。1つでも落ちたら何も消さずに止まる(終了コード 1)。
# 確認の中身は SKILL.md の「後始末の安全確認」節と対応させてある。
#
# 依存: bash・git・gh(cleanup / list)・jq。リポジトリのどこから呼んでもよい(主作業ツリーで動く)。
set -u

WT_DIR_REL=".claude/worktrees"
REMOTE="${WT_REMOTE:-origin}"

die() { printf 'wt: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

# 主作業ツリー(git worktree list の先頭)。作業ツリーの中から呼ばれても主作業ツリーで動く
main_root() {
  git worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /,""); print; exit}'
}

default_branch() {
  local ref
  ref=$(git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null) && { printf '%s' "${ref#"$REMOTE"/}"; return; }
  die "既定ブランチが分かりません($REMOTE/HEAD が無い)。git remote set-head $REMOTE --auto で設定してください"
}

# ブランチを抱えている作業ツリーのパス(無ければ空)
worktree_of() { # <branch>
  git worktree list --porcelain | awk -v ref="refs/heads/$1" '
    /^worktree /{p=substr($0,10)}
    $0=="branch " ref {print p; exit}'
}

# ブランチ名として安全か(git の規則+パス脱出の禁止)
valid_branch() { # <branch>
  git check-ref-format --branch "$1" >/dev/null 2>&1 || return 1
  case "$1" in -*|*..*) return 1 ;; esac
  return 0
}

# PATH 上の gh で、ブランチから作られたマージ済み PR を1件引く。JSON 1行か空。
# --head はフォークの同名ブランチも拾いうるが、後段で先端が PR に含まれることを確かめるので誤って消すことはない
merged_pr() { # <branch>
  gh pr list --head "$1" --state merged --limit 1 \
    --json number,headRefOid,url --jq '.[0] // empty' 2>/dev/null
}

# 作業ツリーの中を cwd にしているプロセス(開発サーバ・子セッション・シェル)を列挙する。
# /proc が無い環境では確かめようがないので空を返す(ここで止めると他の OS で使えなくなる)
procs_in() { # <dir>
  local d="$1" p cwd
  [ -d /proc ] || return 0
  for p in /proc/[0-9]*; do
    cwd=$(readlink "$p/cwd" 2>/dev/null) || continue
    case "$cwd" in "$d"|"$d"/*)
      printf '%s %s\n' "${p#/proc/}" "$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null | cut -c1-80)" ;;
    esac
  done
}

cmd_create() {
  [ $# -eq 1 ] || die "使い方: wt.sh create <branch>"
  local b="$1" root base path
  valid_branch "$b" || die "ブランチ名として使えません: $b"
  root=$(main_root); [ -n "$root" ] || die "git リポジトリの中で実行してください"
  cd "$root" || exit 1
  base=$(default_branch) || exit 1
  [ "$b" != "$base" ] || die "既定ブランチ($base)の作業ツリーは作りません"
  git show-ref --verify --quiet "refs/heads/$b" && die "ローカルブランチ $b が既にあります(続きなら既存の作業ツリーを使う: $(worktree_of "$b"))"
  path="$root/$WT_DIR_REL/$b"
  [ -e "$path" ] && die "$path が既にあります"

  git fetch --quiet "$REMOTE" "$base" || die "$REMOTE/$base を取得できません"
  git worktree add "$path" -b "$b" "$REMOTE/$base" || die "作業ツリーを作れませんでした"
  # 追跡先を持たせない: 最初の push で -u を付けたときに $b へ向く(誤って $base へ push しない)
  git -C "$path" branch --unset-upstream >/dev/null 2>&1 || true

  if [ -f "$path/.envrc" ] && command -v direnv >/dev/null 2>&1; then
    (cd "$path" && direnv allow) || info "注意: direnv allow に失敗しました。$path で手で実行してください"
  fi
  info "作成: ${path}(ブランチ ${b}、起点 ${REMOTE}/${base} = $(git rev-parse --short "$REMOTE/$base"))"
}

cmd_list() {
  local root base b wt pr state remote_branches
  root=$(main_root); [ -n "$root" ] || die "git リポジトリの中で実行してください"
  cd "$root" || exit 1
  base=$(default_branch) || exit 1
  git fetch --quiet --prune "$REMOTE" 2>/dev/null || info "注意: $REMOTE を取得できませんでした(手元の情報で表示します)"
  remote_branches=$(git for-each-ref --format='%(refname:lstrip=3)' "refs/remotes/$REMOTE" | grep -vxF -e HEAD -e "$base")

  printf '%-40s %-6s %-6s %s\n' BRANCH LOCAL REMOTE 'PR / 作業ツリー'
  { git for-each-ref --format='%(refname:short)' refs/heads; printf '%s\n' "$remote_branches"; } \
    | grep -v '^$' | grep -vxF "$base" | sort -u | while IFS= read -r b; do
      local_has=-; remote_has=-
      git show-ref --verify --quiet "refs/heads/$b" && local_has=yes
      printf '%s\n' "$remote_branches" | grep -qxF "$b" && remote_has=yes
      pr=$(gh pr list --head "$b" --state all --limit 1 --json number,state --jq '.[0] // empty | "#\(.number) \(.state)"' 2>/dev/null)
      state="${pr:-PR なし}"
      wt=$(worktree_of "$b")
      [ -n "$wt" ] && state="$state  ${wt#"$root"/}"
      printf '%-40s %-6s %-6s %s\n' "$b" "$local_has" "$remote_has" "$state"
    done
}

cmd_cleanup() {
  local dry=0
  [ "${1:-}" = "--dry-run" ] && { dry=1; shift; }
  [ $# -eq 1 ] || die "使い方: wt.sh cleanup [--dry-run] <branch>"
  local b="$1" root base json head local_sha remote_sha wt here dirty procs fail=0
  valid_branch "$b" || die "ブランチ名として使えません: $b"
  root=$(main_root); [ -n "$root" ] || die "git リポジトリの中で実行してください"
  base=$(default_branch) || exit 1
  [ "$b" != "$base" ] || die "既定ブランチ($base)は消しません"
  here=$(pwd -P)
  cd "$root" || exit 1
  command -v gh >/dev/null 2>&1 || die "gh が見つかりません(マージ済みかを確かめられないので止めます)"

  ng() { printf '  NG  %s\n' "$*"; fail=1; }
  ok() { printf '  ok  %s\n' "$*"; }

  info "確認: $b"
  git fetch --quiet --prune "$REMOTE" 2>/dev/null || ng "$REMOTE を取得できません(リモートの状態を確かめられない)"

  # 1. マージ済みの PR がある
  json=$(merged_pr "$b")
  head=$(printf '%s' "$json" | jq -r '.headRefOid // empty' 2>/dev/null)
  if [ -n "$head" ]; then
    ok "マージ済み PR: $(printf '%s' "$json" | jq -r .url)(先端 ${head:0:7})"
  else
    ng "マージ済みの PR が見つかりません(未マージ・PR なし・gh 未ログインのいずれか)"
  fi

  # 2. ローカルブランチに、マージ後に足したコミットが無い(先端が PR の先端と一致)
  local_sha=$(git rev-parse --verify --quiet "refs/heads/$b")
  if [ -z "$local_sha" ]; then
    ok "ローカルブランチ: なし"
  elif [ -n "$head" ] && [ "$local_sha" = "$head" ]; then
    ok "ローカルブランチの先端が PR と一致"
  elif [ -n "$head" ] && git merge-base --is-ancestor "$local_sha" "$head" 2>/dev/null; then
    ok "ローカルブランチの先端は PR に含まれる(${local_sha:0:7})"
  else
    ng "ローカルブランチ(${local_sha:0:7})に PR へ入っていないコミットがあります"
  fi

  # 3. リモートブランチも同じ(マージ後に誰かが push していない)
  remote_sha=$(git rev-parse --verify --quiet "refs/remotes/$REMOTE/$b")
  if [ -z "$remote_sha" ]; then
    ok "リモートブランチ: なし(削除済み)"
  elif [ -n "$head" ] && { [ "$remote_sha" = "$head" ] || git merge-base --is-ancestor "$remote_sha" "$head" 2>/dev/null; }; then
    ok "リモートブランチの先端は PR に含まれる"
  else
    ng "リモートブランチ(${remote_sha:0:7})に PR へ入っていないコミットがあります"
  fi

  # 4〜6. 作業ツリー: 未コミットの変更・未追跡ファイルが無く、誰も中にいない
  wt=$(worktree_of "$b")
  if [ -z "$wt" ]; then
    ok "作業ツリー: なし"
  elif [ "$wt" = "$root" ]; then
    # 主作業ツリーは消さない。ブランチだけを片付けるには、先に既定ブランチへ戻す
    ng "主作業ツリーが $b のままです(git switch $base してから実行してください)"
  else
    dirty=$(git -C "$wt" status --porcelain 2>/dev/null)
    if [ -z "$dirty" ]; then ok "作業ツリーに未コミットの変更・未追跡ファイルなし"
    else ng "作業ツリー $wt に未コミットの変更か未追跡ファイルがあります:"; printf '%s\n' "$dirty" | sed 's/^/        /' | head -20
    fi
    case "$here" in "$wt"|"$wt"/*) ng "この作業ツリーの中から呼ばれています(主作業ツリーから実行してください)" ;; esac
    procs=$(procs_in "$wt")
    if [ -z "$procs" ]; then ok "作業ツリーの中で動いているプロセスなし"
    else ng "作業ツリーの中で動いているプロセスがあります(開発サーバ・子セッションを止めてください):"; printf '%s\n' "$procs" | sed 's/^/        /'
    fi
  fi

  if [ "$fail" -ne 0 ]; then
    info "中止: 確認に通らなかったため、何も消していません"
    exit 1
  fi
  if [ -z "$wt" ] && [ -z "$local_sha" ] && [ -z "$remote_sha" ]; then
    info "消すものはありません"
    return 0
  fi

  info "実行:"
  [ -n "$wt" ] && info "  git worktree remove $wt"
  [ -n "$local_sha" ] && info "  ローカルブランチ $b を削除(先端 ${local_sha:0:7} のままなら)"
  [ -n "$remote_sha" ] && info "  リモートブランチ $REMOTE/$b を削除(先端 ${remote_sha:0:7} のままなら)"
  [ "$dry" -eq 1 ] && { info "(--dry-run のため実行していません)"; return 0; }

  # 確認から削除までの間に入った変更を消さないよう、3つとも「確認した時点のまま」のときだけ消す。
  # 作業ツリーは --force を付けなければ、変更が入っていたとき git 自身が止める
  if [ -n "$wt" ]; then git worktree remove "$wt" || die "作業ツリーを消せませんでした(ブランチは残してあります)"; fi
  # squash マージではブランチが既定ブランチの祖先にならず branch -d が通らない。
  # 代わりに先端が確認時の値と一致するときだけ消す(一致しなければ update-ref が失敗する)
  if [ -n "$local_sha" ]; then git update-ref -d "refs/heads/$b" "$local_sha" || die "ローカルブランチを消せませんでした(確認の後に動いた可能性があります)"; fi
  if [ -n "$remote_sha" ]; then
    git push --quiet --force-with-lease="refs/heads/$b:$remote_sha" "$REMOTE" --delete "$b" \
      || die "リモートブランチを消せませんでした(確認の後に push された可能性があります)"
  fi
  git worktree prune
  info "完了: $b を片付けました"
}

sub="${1:-}"; [ $# -gt 0 ] && shift
case "$sub" in
  create) cmd_create "$@" ;;
  list) cmd_list "$@" ;;
  cleanup) cmd_cleanup "$@" ;;
  *) die "使い方: wt.sh {create <branch>|list|cleanup [--dry-run] <branch>}" ;;
esac
