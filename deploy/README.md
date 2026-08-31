# 배포

웹 1컨테이너 구성이다. 사이드카(Task 3)는 아직 없으므로 이 문서에도 없다.

## 준비

```bash
cp .env.example .env.production     # 값 채우기
```

`.env.production` 에 반드시 있어야 하는 것:

| 키 | 비고 |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | compose 가 `true` 로 넣는다. 직접 `docker run` 할 때는 손으로 넣어야 한다 |
| `DATABASE_URL` | compose 가 `file:/app/prisma/prod.db` 로 넣는다 |
| `ANTHROPIC_API_KEY` | 분석·검증 |
| `NCP_APIGW_API_KEY_ID` · `NCP_APIGW_API_KEY` | 네이버 뉴스 API HUB |
| `DART_API_KEY` · `NTS_SERVICE_KEY` | DART · 국세청/나라장터 공용 |

## 기동

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f web
```

기동할 때 엔트리포인트가 `prisma migrate deploy` 를 먼저 돌린다. 마이그레이션이 실패하면
서버를 띄우지 않는다 — 스키마가 뒤처진 채로 뜨면 첫 요청에서야 알게 된다.
마이그레이션을 건너뛰려면 `SKIP_MIGRATE=1`.

## 관리자 계정

공개 회원가입이 없다. 계정 발급 스크립트는 TypeScript 라 런타임 이미지에 들어 있지 않으므로
호스트에서 볼륨의 DB 파일에 직접 발급한다.

```bash
# 1) 볼륨의 DB 를 호스트로 꺼낸다
docker compose -f deploy/docker-compose.prod.yml cp web:/app/prisma/prod.db ./prod.db

# 2) 계정을 넣는다 (저장소 체크아웃과 npm ci 가 있는 곳에서)
DATABASE_URL="file:$(pwd)/prod.db" ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts you@example.com

# 3) 되돌려 넣고 재기동한다
docker compose -f deploy/docker-compose.prod.yml cp ./prod.db web:/app/prisma/prod.db
docker compose -f deploy/docker-compose.prod.yml restart web
```

## 상태 확인

```bash
curl -fsS http://127.0.0.1:3000/api/health     # {"status":"ok","database":"up"}
```

헬스체크는 인증 없이 열려 있고 DB 왕복까지 본다. compose 의 healthcheck 가 이것을 쓴다.

## 백업

SQLite 파일과 업로드물이 볼륨에 있다.

```bash
docker compose -f deploy/docker-compose.prod.yml exec web sh -c 'cat /app/prisma/prod.db' > backup-$(date +%F).db
docker run --rm -v project1000_files:/data -v "$(pwd)":/out alpine tar czf /out/files-$(date +%F).tgz -C /data .
```

## 리버스 프록시

컨테이너는 `127.0.0.1:3000` 에만 연다. 앞단은 nginx 로 TLS 를 끊고 넘긴다.
`AUTH_TRUST_HOST=true` 가 없으면 Auth.js 가 `UntrustedHost` 로 세션 요청을 전부 막는다 —
standalone 부팅 검증에서 실제로 걸렸던 지점이다.

## PostgreSQL 로 옮길 때

지금은 SQLite 다. 옮기려면 코드 변경이 따른다 — 결정 전에 비용을 보고 판단할 것.

1. `prisma/schema.prisma` 의 `provider` 를 `postgresql` 로
2. 어댑터를 `@prisma/adapter-better-sqlite3` → `@prisma/adapter-pg` 로 (`src/lib/db.ts`)
3. **기존 마이그레이션 파일은 SQLite 방언이라 재사용할 수 없다** — 초기화 후 새로 생성
4. 테스트가 `file:./prisma/test.db` 를 쓰므로 테스트용 PG 인스턴스도 필요
5. compose 에 `postgres` 서비스와 healthcheck 추가, `DATABASE_URL` 교체

## 검증 상태

- `next build` → `.next/standalone` 부팅, `/api/health` 200, `/login` 200 — **확인함**
- 이미지 빌드·compose 기동 — 이 저장소를 만든 환경에 Docker 데몬이 없어 **미검증**.
  첫 배포 때 `docker compose build` 부터 확인할 것. 특히 `better-sqlite3` 네이티브 모듈은
  빌드·실행 이미지를 같은 베이스(`node:24-slim`)로 맞춰 두었으나 실제 빌드로 확인해야 한다.
