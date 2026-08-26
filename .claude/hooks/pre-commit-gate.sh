#!/usr/bin/env bash
# PreToolUse(Bash) — git commit 명령에만 test + lint 게이트를 건다.
# settings.json 에는 명령 필터 기능이 없으므로 여기서 직접 거른다.
set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "훅 실패 — jq 를 찾을 수 없어 검사를 수행할 수 없다. PATH 를 확인할 것." >&2; exit 2; }

cmd=$(jq -r '.tool_input.command // ""')
case "$cmd" in
  "git commit"* | *" && git commit"* | *"; git commit"* | *"| git commit"*) ;;
  *) exit 0 ;;
esac

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
