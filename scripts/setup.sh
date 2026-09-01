#!/usr/bin/env bash
# 새 체크아웃을 돌 수 있는 상태로 만든다 — Node 의존성과 DB 마이그레이션.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

echo "[setup] npm ci"
npm ci

echo "[setup] prisma migrate"
npx prisma migrate deploy
npx prisma generate

echo "[setup] 완료. 개발 서버는 ./scripts/dev.sh"
