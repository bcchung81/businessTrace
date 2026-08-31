#!/usr/bin/env bash
# 새 체크아웃을 돌 수 있는 상태로 만든다 — Node 의존성 · DB 마이그레이션 · (있으면) 사이드카까지.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

echo "[setup] npm ci"
npm ci

echo "[setup] prisma migrate"
npx prisma migrate deploy
npx prisma generate

if command -v uv >/dev/null 2>&1; then
  echo "[setup] sidecar (uv sync --python 3.12)"
  (cd sidecar && uv sync --python 3.12)
else
  echo "[setup] uv 가 없어 사이드카를 건너뛴다 — 선택적 계층이므로 없어도 앱은 돈다."
fi

echo "[setup] 완료. 개발 서버는 ./scripts/dev.sh"
