#!/bin/sh
# DB 와 산출물을 떠서 정해진 일수만 남긴다.
#   deploy/backup.sh /srv/backup [보존일수]
# VACUUM INTO 로 뜬다 — 쓰기 중인 파일을 cat 으로 복사하면 페이지가 섞여 열리지 않는 스냅샷이 나온다.
# 서버를 멈추지 않아도 된다.
set -eu

OUT="${1:?usage: backup.sh <출력 디렉터리> [보존일수]}"
KEEP="${2:-7}"
APP_DIR="${APP_DIR:-/srv/seonggwa}"
DB="${DB_PATH:-$APP_DIR/prisma/prod.db}"
STAMP="$(date +%F)"

mkdir -p "$OUT"

rm -f "$OUT/db-$STAMP.db"
sqlite3 "$DB" "VACUUM INTO '$OUT/db-$STAMP.db'"

# 열리는 파일인지 그 자리에서 확인한다 — 복원할 때 알게 되면 늦다.
sqlite3 "$OUT/db-$STAMP.db" "PRAGMA integrity_check;" | grep -qx "ok"

tar czf "$OUT/files-$STAMP.tgz" -C "$APP_DIR/data" .

find "$OUT" -maxdepth 1 -name 'db-*.db' -mtime "+$KEEP" -delete
find "$OUT" -maxdepth 1 -name 'files-*.tgz' -mtime "+$KEEP" -delete

echo "[backup] $OUT/db-$STAMP.db · $OUT/files-$STAMP.tgz (보존 ${KEEP}일)"
