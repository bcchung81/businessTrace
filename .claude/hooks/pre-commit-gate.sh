#!/usr/bin/env bash
# PreToolUse(Bash, git commit) — 증거 없이 완료를 주장하지 못하게 한다.
set -uo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root" || exit 0

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

if ! out=$(npm test 2>&1); then
  deny "커밋 차단 — npm test 실패. 마지막 출력: $(printf '%s' "$out" | tail -12)"
fi

if ! out=$(npm run lint 2>&1); then
  deny "커밋 차단 — npm run lint 실패. 마지막 출력: $(printf '%s' "$out" | tail -12)"
fi

exit 0
