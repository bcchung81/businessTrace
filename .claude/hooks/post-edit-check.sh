#!/usr/bin/env bash
# PostToolUse(Write|Edit) — 쓰인 내용을 검사한다.
# 과거 사고에서 도출된 규칙만 담는다. docs/incidents.md 참조.
set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "훅 실패 — jq 를 찾을 수 없어 검사를 수행할 수 없다. PATH 를 확인할 것." >&2; exit 2; }

f=$(jq -r '.tool_response.filePath // .tool_input.file_path // ""')
if [ -z "$f" ] || [ ! -f "$f" ]; then
  exit 0
fi

block() {
  printf '%s\n' "$1" >&2
  exit 2
}

warn() {
  jq -n --arg m "$1" '{systemMessage: $m}'
  exit 0
}

case "$f" in
  *.ts | *.tsx | *.js | *.mjs | *.py) ;;
  *) exit 0 ;;
esac

if grep -qE 'serviceKey=(\$\{|\"[[:space:]]*\+|'"'"'[[:space:]]*\+)' "$f"; then
  block "data.go.kr 인증키를 URL 문자열에 직접 삽입했다. Decoding 키의 '+' 가 공백으로 해석돼 401 이 난다. URL.searchParams.set('serviceKey', key) 로 넘길 것. 스킬 external-apis 참조."
fi

if grep -q 'openapi\.naver\.com' "$f"; then
  warn "네이버 레거시 엔드포인트(openapi.naver.com)를 사용했다. 검색 API 는 API HUB 로 이관됐다 — naverapihub.apigw.ntruss.com/search/v1/news 와 X-NCP-APIGW-* 헤더를 한 쌍으로 사용할 것. 스킬 external-apis 참조."
fi

case "$f" in
  */src/*.ts | */src/*.tsx)
    if grep -qE '^[[:space:]]*//[^/]' "$f"; then
      warn "$(basename "$f") 에 줄 주석(//)이 있다. 함수 설명은 JSDoc(/** */) 3줄 이내로 쓰고, 그 밖의 설명은 이름과 구조로 대신할 것."
    fi
    if awk '/^[[:space:]]*\/\*\*/{n=0; inb=1; next} inb&&/\*\//{inb=0; if(n>3) found=1; next} inb{n++} END{exit !found}' "$f"; then
      warn "$(basename "$f") 에 4줄 이상인 JSDoc 이 있다. 함수 설명은 본문 3줄 이내로 줄일 것."
    fi
    ;;
esac

exit 0
