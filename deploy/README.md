# 배포

웹 1컨테이너 + 마이그레이션·스크립트를 돌리는 CLI 이미지 구성이다.

| 서비스 | 언제 도는가 | 무엇이 들어 있나 |
|---|---|---|
| `migrate` | `up` 할 때마다 한 번, web 보다 먼저 | 전체 `node_modules`(prisma CLI·tsx) + 저장소 |
| `web` | 상시 | `.next/standalone` 만. **prisma CLI 없음** |
| `cli` | 손으로 부를 때만 (`--profile tools`) | `migrate` 와 같은 이미지 |

`web` 이미지에 prisma CLI 를 선별 복사하는 길은 닫혀 있다 — CLI 가 최상위로 호이스트된
`effect`·`c12`·`deepmerge-ts`… 를 줄줄이 require 해서 하나씩 채워도 끝나지 않는다.
그래서 마이그레이션과 스크립트는 전부 `migrate`/`cli` 이미지에서 돈다.

## 준비

```bash
cp .env.example .env.production     # 값 채우기
```

`.env.production` 에 반드시 있어야 하는 것:

| 키 | 비고 |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | compose 가 `true` 로 넣는다. 직접 `docker run` 할 때는 손으로 넣어야 한다 |
| `DATABASE_URL` | compose 가 `file:/app/db/prod.db` 로 넣는다 |
| `ANTHROPIC_API_KEY` | 분석·검증 |
| `NCP_APIGW_API_KEY_ID` · `NCP_APIGW_API_KEY` | 네이버 뉴스 API HUB |
| `DART_API_KEY` · `NTS_SERVICE_KEY` | DART · 국세청/나라장터 공용 |

없거나 형식이 틀리면 **기동하지 않고 무엇이 빠졌는지 적고 죽는다**(`src/lib/env.ts`).
조용히 기본값으로 떨어지지 않는다 — 옛날에 `DATABASE_URL` 이 빠지면 개발용 DB 로 붙었다.

## 기동

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f web
```

`migrate` 가 완주해야 `web` 이 뜬다(`service_completed_successfully`).
마이그레이션이 실패하면 web 은 시작조차 하지 않는다.

**볼륨은 `/app/db`(DB) 와 `/app/data`(산출물) 둘뿐이다.** `/app/prisma` 는 마운트하지 않는다 —
named volume 은 최초 생성 때만 이미지 내용을 복사하므로, 스키마 디렉터리를 덮으면 다음 배포부터
새 마이그레이션이 조용히 무시되고 코드만 새 스키마를 기대한 채 뜬다.

## 관리자 계정

공개 회원가입이 없다. CLI 이미지에서 발급한다 — 동작 중인 DB 를 건드리지 않는다.

```bash
docker compose -f deploy/docker-compose.prod.yml --profile tools run --rm \
  -e ADMIN_PASSWORD='...' cli npx tsx scripts/create-admin.ts you@example.com
```

비밀번호는 12자 이상, 영문·숫자·특수문자 중 2가지 이상 조합이어야 한다.

## 정기 스크립트

같은 자리에서 돈다. 주기와 거를 때의 대가는 아래와 같다.

```bash
docker compose -f deploy/docker-compose.prod.yml --profile tools run --rm cli \
  npx tsx scripts/collect-pension.ts 2026
```

| 무엇 | 주기 | 거르면 |
|---|---|---|
| `scripts/collect-pension.ts <연도>` | **매월 15일 이후 1회** | 원천이 12개월치만 유지하고 지운다. **그 달은 영영 복구 불가** |
| `scripts/collect-procurement.ts 12` | 월 1회(약 40분) | 재무 결측 43개사의 유일한 매출 대리지표가 낡는다 |
| `scripts/collect-venture.ts` | 분기 1회 | 만료된 벤처확인이 계속 "유효" 로 표시된다 |
| 공식 원천 7종 | 분석 전 | 화면 버튼·배치 `stage:"sources"` 로 커버됨 |

## 상태 확인

```bash
curl -fsS http://127.0.0.1:3000/api/health     # {"status":"ok","database":"up"}
```

헬스체크는 인증 없이 열려 있고 DB 왕복까지 본다. compose 의 healthcheck 가 이것을 쓴다.
비인증 응답이므로 실패해도 `{"status":"degraded"}` 와 503 만 준다 — 예외 원문은 컨테이너 로그에 있다.

## 백업

DB 는 `db` 볼륨, 업로드·리포트는 `files` 볼륨에 있다.
**`cat prod.db > backup.db` 는 쓰지 않는다** — 쓰기 중인 파일을 그대로 복사하면 깨진 스냅샷이 나온다.

```bash
deploy/backup.sh /srv/backup       # DB(VACUUM INTO) + files tar, 7일 롤링
```

호스트 cron 에 건다.

```cron
17 4 * * * /srv/project1000/deploy/backup.sh /srv/backup >> /var/log/seonggwa-backup.log 2>&1
```

복원은 **월 1회 리허설**한다. 리허설이 없는 백업은 백업이 아니다.

```bash
docker compose -f deploy/docker-compose.prod.yml stop web
docker compose -f deploy/docker-compose.prod.yml --profile tools run --rm \
  -v /srv/backup:/restore cli sh -c 'cp /restore/db-2026-09-03.db /app/db/prod.db'
docker compose -f deploy/docker-compose.prod.yml up -d web
```

## 리버스 프록시

컨테이너는 `127.0.0.1:3000` 에만 연다. 앞단은 nginx 로 TLS 를 끊고 넘긴다.
`AUTH_TRUST_HOST=true` 가 없으면 Auth.js 가 `UntrustedHost` 로 세션 요청을 전부 막는다 —
standalone 부팅 검증에서 실제로 걸렸던 지점이다.

SSE(배치 진행률)를 쓰므로 프록시에서 버퍼링을 꺼야 한다.

```nginx
proxy_buffering off;
proxy_read_timeout 3600s;
```

## PostgreSQL 로 옮길 때

지금은 SQLite 다. 옮기려면 코드 변경이 따른다 — 결정 전에 비용을 보고 판단할 것.
`docs/2026-09-03-production-readiness.md` §4 에 조용히 깨지는 곳 넷과 순서가 적혀 있다.

## 검증 상태

- `next build` → `.next/standalone` 부팅, `/api/health` 200, `/login` 200 — **확인함**
- `.dockerignore`·볼륨 경로·마이그레이션 실행 경로의 정합성 — `src/lib/deployConfig.test.ts` 가 강제한다
- 이미지 빌드·compose 기동 — 이 저장소를 만든 환경에 Docker 데몬이 없어 **미검증**.
  첫 배포 때 `docker compose build` 부터 확인할 것. 특히 `better-sqlite3` 네이티브 모듈은
  빌드·실행 이미지를 같은 베이스(`node:24-slim`)로 맞춰 두었으나 실제 빌드로 확인해야 한다.
