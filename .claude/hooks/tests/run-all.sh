#!/bin/bash
# フックのテストを全部走らせる。合成リポジトリを一時ディレクトリに作って検証するため、
# 実リポジトリの docs/ や .claude/state/ は書き換えない。
#
# 実行: bash .claude/hooks/tests/run-all.sh
set -u
here=$(cd "$(dirname "$0")" && pwd -P)

failed=0
for t in "$here"/*.test.sh; do
  [ -f "$t" ] || continue
  printf '\n=== %s ===\n' "$(basename "$t")"
  bash "$t" || failed=$((failed + 1))
done

printf '\n'
if [ "$failed" -gt 0 ]; then
  printf '%d 個のテストファイルが失敗しました\n' "$failed"
  exit 1
fi
printf 'すべてのテストファイルが成功しました\n'
