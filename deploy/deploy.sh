#!/bin/sh
# 서버에서 새 코드를 올린다. /srv/seonggwa 에서 seonggwa 사용자로 돌린다.
#   sudo -u seonggwa deploy/deploy.sh
# 마이그레이션 앞뒤로 서버를 멈췄다 켠다 — 낡은 코드가 새 스키마 위에서 도는 창을 만들지 않는다.
# 한두 명이 쓰는 도구라 이 짧은 중단이 무중단 배포보다 싸다.
set -eu

APP_DIR="${APP_DIR:-/srv/seonggwa}"
SERVICE="${SERVICE:-seonggwa}"

cd "$APP_DIR"

# Next 는 작업 디렉터리의 .env 를 읽는다. 서버에 하나 놓여 있으면 EnvironmentFile 에 없는 키를
# 조용히 채워, 기동 시 환경변수 게이트가 잡아야 할 누락을 통과시킨다. DATABASE_URL 이 여기 있으면
# 엉뚱한 DB 에 붙고도 정상으로 보인다. 비밀은 /etc/seonggwa/env 한 곳에만 둔다.
if [ -e "$APP_DIR/.env" ] || [ -e "$APP_DIR/.env.production" ] || [ -e "$APP_DIR/.env.local" ]; then
  echo "[deploy] $APP_DIR 에 .env* 가 있다. 지우고 /etc/seonggwa/env 만 쓸 것" >&2
  exit 1
fi

echo "[deploy] 코드 받기"
git pull --ff-only

echo "[deploy] 의존성"
# devDependencies 도 받는다 — prisma CLI 는 마이그레이션에, tsx 는 정기 수집 스크립트에 필요하다.
npm ci --include=dev

echo "[deploy] 빌드"
# 빌드는 서버가 도는 동안 해도 된다. DB 도 API 키도 보지 않는다(정적 프리렌더 페이지 0개).
npm run build

echo "[deploy] 중단 → 마이그레이션 → 재기동"
sudo systemctl stop "$SERVICE"
npx prisma migrate deploy
sudo systemctl start "$SERVICE"

echo "[deploy] 헬스체크"
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "[deploy] 완료 — $(curl -fsS http://127.0.0.1:3000/api/health)"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "[deploy] 60초 안에 뜨지 않았다. journalctl -u $SERVICE -n 50 을 볼 것" >&2
exit 1
