#!/bin/bash
# テスト共通の道具立て。各テストは合成プロジェクトを一時ディレクトリに作り、
# 合成JSONを標準入力へ流して、終了コード・標準出力・状態ファイルを検証する。
# 実リポジトリの docs/ や .claude/state/ は書き換えない。
set -u

TEST_TOTAL=0
TEST_FAILED=0

report() { # <ok|fail> <説明>
  TEST_TOTAL=$((TEST_TOTAL + 1))
  if [ "$1" = ok ]; then
    printf 'ok %d - %s\n' "$TEST_TOTAL" "$2"
  else
    printf 'not ok %d - %s\n' "$TEST_TOTAL" "$2"
    TEST_FAILED=$((TEST_FAILED + 1))
  fi
}

assert_contains() { # <説明> <対象> <含むべき文字列>
  case "$2" in *"$3"*) report ok "$1" ;; *) report fail "$1(実際: ${2:-空})" ;; esac
}

assert_not_contains() { # <説明> <対象> <含んではいけない文字列>
  case "$2" in *"$3"*) report fail "$1(実際: $2)" ;; *) report ok "$1" ;; esac
}

assert_empty() { # <説明> <対象>
  if [ -z "$2" ]; then report ok "$1"; else report fail "$1(実際の出力: $2)"; fi
}

assert_exit_zero() { # <説明> <終了コード>
  if [ "$2" -eq 0 ]; then report ok "$1"; else report fail "$1(実際の終了コード: $2)"; fi
}

assert_file_has_line() { # <説明> <ファイル> <行>
  if grep -qxF "$3" "$2" 2>/dev/null; then report ok "$1"; else report fail "$1($2 に $3 が無い)"; fi
}

test_summary() {
  printf '1..%d\n' "$TEST_TOTAL"
  if [ "$TEST_FAILED" -gt 0 ]; then
    printf 'FAILED: %d/%d assertions failed\n' "$TEST_FAILED" "$TEST_TOTAL"
    return 1
  fi
  printf 'All %d assertions passed\n' "$TEST_TOTAL"
  return 0
}

require_jq() {
  command -v jq >/dev/null 2>&1 || { echo "jq が見つかりません。フックは jq に依存するためテストできません。" >&2; exit 1; }
}

# スキルの実体をプロジェクトへ置く。フックは対応スキルが無ければ黙って無効になるため、
# ブロックを検証するテストでは必ず用意する。
install_skill() { # <プロジェクト> <スキル名>
  mkdir -p "$1/.claude/skills/$2"
  printf -- '---\nname: %s\n---\n' "$2" > "$1/.claude/skills/$2/SKILL.md"
}
