#!/usr/bin/env bash
# 개발 서버를 실행 가능한 상태로 만들고 기동한다.
# 사이드카(sidecar/)가 생기면 여기에 uvicorn 동시 기동을 추가한다.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

say() { printf '\033[36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

[ -f .env ] || die ".env 가 없다. .env.example 을 복사해 키를 채울 것."

missing=()
for key in DATABASE_URL AUTH_SECRET; do
  grep -qE "^${key}=.+" .env || missing+=("$key")
done
[ ${#missing[@]} -eq 0 ] || die ".env 에 값이 비어 있다: ${missing[*]}"

[ -d node_modules ] || { say "의존성 설치"; npm ci; }

say "Prisma 클라이언트 생성"
npx prisma generate >/dev/null

say "마이그레이션 적용 (개발 DB)"
npx prisma migrate deploy >/dev/null

say "마이그레이션 적용 (테스트 DB)"
DATABASE_URL="file:./prisma/test.db" npx prisma migrate deploy >/dev/null

admins=$(npx tsx scripts/count-users.ts)
if [ "$admins" = "0" ]; then
  printf '\033[33m!\033[0m 관리자 계정이 없다. 아래로 발급할 것:\n'
  printf "    ADMIN_PASSWORD='<password>' npx tsx scripts/create-admin.ts <email>\n"
else
  say "관리자 계정 ${admins}개 확인"
fi

autofill=$(grep -E '^DEV_AUTOFILL_EMAIL=.+' .env | cut -d= -f2- || true)
[ -n "$autofill" ] && printf '\033[33m!\033[0m 로그인 자동입력 활성 (%s) — 테스트 기간 한정, 배포 전 .env 에서 제거할 것\n' "$autofill"

say "http://localhost:3000 기동"
exec npm run dev
