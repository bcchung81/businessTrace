#!/bin/sh
# DB 와 산출물 볼륨을 호스트로 받아 7일치만 남긴다.
# VACUUM INTO 로 뜬다 — cat 으로 복사하면 쓰기 중인 페이지가 섞여 열리지 않는 파일이 나온다.
set -eu

OUT="${1:?usage: backup.sh <출력 디렉터리> [보존일수]}"
KEEP="${2:-7}"
COMPOSE="$(dirname "$0")/docker-compose.prod.yml"
STAMP="$(date +%F)"

mkdir -p "$OUT"

docker compose -f "$COMPOSE" --profile tools run --rm \
  -v "$OUT:/backup" cli \
  sh -c "rm -f /backup/db-$STAMP.db && sqlite3 /app/db/prod.db \"VACUUM INTO '/backup/db-$STAMP.db'\" && tar czf /backup/files-$STAMP.tgz -C /app/data ."

# 열리는 파일인지 그 자리에서 확인한다 — 복원할 때 알게 되면 늦다.
docker compose -f "$COMPOSE" --profile tools run --rm \
  -v "$OUT:/backup" cli \
  sqlite3 "/backup/db-$STAMP.db" "PRAGMA integrity_check;" | grep -qx "ok"

find "$OUT" -maxdepth 1 -name 'db-*.db' -mtime "+$KEEP" -delete
find "$OUT" -maxdepth 1 -name 'files-*.tgz' -mtime "+$KEEP" -delete

echo "[backup] $OUT/db-$STAMP.db · $OUT/files-$STAMP.tgz (보존 ${KEEP}일)"
