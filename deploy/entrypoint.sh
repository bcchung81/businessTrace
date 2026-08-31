#!/bin/sh
# 마이그레이션을 먼저 적용하고 서버를 띄운다. 실패하면 기동하지 않는다 —
# 스키마가 뒤처진 채로 뜨면 첫 요청에서야 알게 된다.
set -e

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] prisma migrate deploy"
  node ./node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
