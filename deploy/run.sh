#!/bin/sh
# 서비스와 같은 환경변수를 얹어 저장소 안에서 한 명령을 돌린다.
#   deploy/run.sh npx tsx scripts/collect-pension.ts 2026
#   ADMIN_PASSWORD='...' deploy/run.sh npx tsx scripts/create-admin.ts you@example.com
# 환경변수를 손으로 늘어놓지 않기 위한 것이다 — 명령줄에 적으면 ps 에 그대로 보인다.
set -eu

ENV_FILE="${ENV_FILE:-/etc/seonggwa/env}"
APP_DIR="${APP_DIR:-/srv/seonggwa}"

[ -r "$ENV_FILE" ] || { echo "환경변수 파일을 읽을 수 없다: $ENV_FILE" >&2; exit 1; }

set -a
. "$ENV_FILE"
set +a

cd "$APP_DIR"
exec "$@"
