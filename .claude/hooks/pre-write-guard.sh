#!/usr/bin/env bash
# PreToolUse(Write) — 파일이 생기기 전에 막는다.
set -uo pipefail

f=$(jq -r '.tool_input.file_path // ""')
[ -z "$f" ] && exit 0

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

case "$f" in
  */sidecar/*.py | */scripts/*.py) ;;
  *.py)
    deny "루트에 Python 파일을 두지 않는다. sidecar/ 또는 scripts/ 아래로 옮길 것. (CLAUDE.md 아키텍처 규약)"
    ;;
esac

case "$f" in
  */middleware.ts | */middleware.js)
    deny "Next.js 16 에서 middleware 는 proxy 로 개명됐다. src/proxy.ts 에 'export function proxy(request)' 로 작성할 것. edge 런타임은 지원되지 않는다."
    ;;
esac

exit 0
