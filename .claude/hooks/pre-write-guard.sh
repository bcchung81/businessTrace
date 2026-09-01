#!/usr/bin/env bash
# PreToolUse(Write) — 파일이 생기기 전에 막는다.
# exit 2 + stderr 는 권한 모드와 무관하게 도구 호출을 차단한다.
set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "훅 실패 — jq 를 찾을 수 없어 검사를 수행할 수 없다. PATH 를 확인할 것." >&2; exit 2; }

f=$(jq -r '.tool_input.file_path // ""')
[ -z "$f" ] && exit 0

deny() {
  printf '%s\n' "$1" >&2
  exit 2
}

case "$f" in
  */scripts/*.py) ;;
  *.py)
    deny "Python 파일은 scripts/ 아래에만 둔다. (CLAUDE.md 아키텍처 규약)"
    ;;
esac

case "$f" in
  */middleware.ts | */middleware.js)
    deny "Next.js 16 에서 middleware 는 proxy 로 개명됐다. src/proxy.ts 에 'export function proxy(request)' 로 작성할 것. edge 런타임은 지원되지 않는다."
    ;;
esac

exit 0
