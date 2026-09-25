# 배포

**서버에서 Node 를 직접 돌린다.** systemd 가 프로세스를, nginx 가 TLS 를 맡는다. 컨테이너는 쓰지 않는다.

```
[nginx :443] ──proxy──> [node :3000 (systemd: seonggwa)] ──> prisma/prod.db
```

| 파일 | 어디로 |
|---|---|
| `seonggwa.service` | `/etc/systemd/system/seonggwa.service` |
| `seonggwa-job@.service` · `seonggwa-*.timer` | `/etc/systemd/system/` — 정기 작업 |
| `nginx.conf` | `/etc/nginx/sites-available/seonggwa` (+ `sites-enabled` 링크) |
| `deploy.sh` | 저장소 안에서 그대로 실행 |
| `run.sh` | 서비스와 같은 환경변수로 스크립트 한 번 돌리기 |
| `backup.sh` | 호스트 cron |

저장소 전체를 서버에 둔다. `.next/standalone` 을 따로 만들지 않는다 —
**prisma CLI 는 마이그레이션에, `tsx` 는 정기 수집 스크립트에 필요**하고 둘 다 `node_modules` 에 있어야 한다.
빼서 얻는 것(이미지 몇백 MB)보다 잃는 것(마이그레이션·스크립트 실행 경로)이 크다.

## 처음 한 번

```bash
sudo useradd --system --create-home --home-dir /srv/seonggwa seonggwa
sudo -u seonggwa git clone <저장소> /srv/seonggwa
sudo -u seonggwa mkdir -p /srv/seonggwa/data

# 환경변수 — 유닛 파일에 적지 않는다. systemctl show 로 전부 읽힌다.
sudo mkdir -p /etc/seonggwa
sudo cp /srv/seonggwa/.env.example /etc/seonggwa/env      # 값 채우기
sudo chown root:seonggwa /etc/seonggwa/env && sudo chmod 640 /etc/seonggwa/env

sudo cp /srv/seonggwa/deploy/seonggwa.service /etc/systemd/system/
sudo cp /srv/seonggwa/deploy/nginx.conf /etc/nginx/sites-available/seonggwa
sudo ln -s /etc/nginx/sites-available/seonggwa /etc/nginx/sites-enabled/
sudo systemctl daemon-reload && sudo systemctl enable seonggwa
sudo -u seonggwa /srv/seonggwa/deploy/deploy.sh
sudo certbot --nginx        # 인증서 발급 후 nginx -t && systemctl reload nginx

# 정기 작업 — 첫 배포(마이그레이션)가 끝난 뒤에 켠다. JobLock 테이블이 있어야 한다
sudo cp /srv/seonggwa/deploy/seonggwa-job@.service /srv/seonggwa/deploy/seonggwa-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now seonggwa-news.timer seonggwa-pension.timer seonggwa-procurement.timer seonggwa-venture.timer
```

`/etc/seonggwa/env` 에 반드시 있어야 하는 것:

| 키 | 비고 |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` — 32자 미만이면 기동하지 않는다 |
| `AUTH_TRUST_HOST` | `true`. 프록시 뒤에서 없으면 Auth.js 가 세션 요청을 전부 막는다 |
| `DATABASE_URL` | `file:/srv/seonggwa/prisma/prod.db` |
| `ANTHROPIC_API_KEY` | 분석·검증 (`LLM_PROVIDER=openai` 면 `OPENAI_API_KEY`) |
| `NCP_APIGW_API_KEY_ID` · `NCP_APIGW_API_KEY` | 네이버 뉴스 API HUB |
| `DART_API_KEY` · `NTS_SERVICE_KEY` | DART · 국세청/나라장터 공용 |

**없거나 형식이 틀리면 무엇이 빠졌는지 전부 적고 죽는다**(`src/lib/env.ts` → `src/instrumentation.ts`).
조용히 기본값으로 떨어지지 않는다 — 옛날에 `DATABASE_URL` 이 빠지면 개발용 DB 로 붙었다.
그 경우 systemd 가 다섯 번 재시도하고 멈추므로 `systemctl status seonggwa` 가 실패로 남는다.

> **`/srv/seonggwa/.env` 는 두지 않는다.** Next 는 작업 디렉터리의 `.env` 를 읽는다 — 하나 놓여 있으면
> `EnvironmentFile` 에 없는 키를 조용히 채워 위 게이트를 통과시킨다. `DATABASE_URL` 이 거기 있으면
> 엉뚱한 DB 에 붙고도 정상으로 보인다. `deploy.sh` 가 `.env*` 를 발견하면 배포를 멈춘다.

## 갱신

```bash
sudo -u seonggwa /srv/seonggwa/deploy/deploy.sh
```

`git pull → npm ci → npm run build → **중단** → migrate → 기동 → 헬스체크` 순이다.
**마이그레이션 앞뒤로 멈췄다 켠다** — 낡은 코드가 새 스키마 위에서 도는 창을 만들지 않는다.
빌드는 서버가 도는 동안 해도 된다(정적 프리렌더 페이지 0개라 DB·API 키를 보지 않는다).

`deploy.sh` 는 `sudo systemctl` 을 부른다. 암호 없이 되게 하려면:

```
# /etc/sudoers.d/seonggwa
seonggwa ALL=(root) NOPASSWD: /usr/bin/systemctl stop seonggwa, /usr/bin/systemctl start seonggwa
```

## 관리자 계정

공개 회원가입이 없다.

```bash
sudo -u seonggwa ADMIN_PASSWORD='...' /srv/seonggwa/deploy/run.sh \
  npx tsx scripts/create-admin.ts you@example.com
```

비밀번호는 12자 이상, 영문·숫자·특수문자 중 2가지 이상 조합이어야 한다.

## 정기 작업

systemd timer 가 `scripts/scheduled.ts <작업>` 을 부른다 — 사람이 누르지 않아도 돈다.
2026-09-25 에 "배치는 사람이 누른다" 결정을 바꿨다. 연금은 한 달을 거르면 영구 손실이라 사람 기억에 맡길 수 없다.

| timer | 언제 (Asia/Seoul) | 하는 일 | 거르면 |
|---|---|---|---|
| `seonggwa-news` | 매일 03:30 | 활성 기업 전체 뉴스. 단계는 `SCHEDULE_NEWS_STAGE` — 기본 `news`(수집만), `full`(분석·검증까지, 검증된 기업도 다시), `off`(건너뜀) | 다음 날 다시 돈다 |
| `seonggwa-pension` | 매월 16일 05:00 | `collect-pension.ts` 를 평가연도마다 | 원천이 12개월치만 유지하고 지운다. **그 달은 영영 복구 불가** |
| `seonggwa-procurement` | 매월 2일 04:30 | `collect-procurement.ts 12` (약 40분) | 재무 결측 43개사의 유일한 매출 대리지표가 낡는다 |
| `seonggwa-venture` | 1·4·7·10월 3일 05:30 | `collect-venture.ts` | 만료된 벤처확인이 계속 "유효" 로 표시된다 |
| — | 분석 전 | 공식 원천 7종 | 화면 버튼·배치 `stage:"sources"` 로 커버됨 |

- `Persistent=true` 라 서버가 꺼져 있던 동안 놓친 실행은 다음 기동 직후 한 번 돈다
- 같은 작업이 이미 돌고 있으면 잠금(`JobLock`)을 못 잡고 `schedule.locked` 를 남기고 건너뛴다. **야간 뉴스는 웹 배치와 같은 잠금(`batch`)** 이다 —
  웹 배치가 도는 밤에는 뉴스 작업이 건너뛰고, 정기 작업이 도는 동안 배치 버튼은 409 로 막힌다
- 잠금은 10분 임대를 2분마다 늘린다. 프로세스가 죽으면 10분 뒤 풀리고, 웹 서버는 기동 때 자기(`web:`) 잠금을 푼다

```bash
systemctl list-timers 'seonggwa-*'
journalctl -u 'seonggwa-job@*' --since today     # schedule.start · schedule.done · schedule.locked · schedule.failed
sudo systemctl start seonggwa-job@pension         # 정기 작업을 손으로 한 번
systemd-analyze calendar '*-01,04,07,10-03 05:30:00 Asia/Seoul'   # 일정 확인
```

스크립트 하나만 손으로 돌릴 때는 서비스와 같은 환경변수를 얹는다.

```bash
sudo -u seonggwa /srv/seonggwa/deploy/run.sh npx tsx scripts/collect-pension.ts 2026
```

`run.sh` 가 `/etc/seonggwa/env` 를 얹고 저장소로 옮겨 준다. 환경변수를 명령줄에 늘어놓으면 `ps` 에 그대로 보인다.
그 파일의 값에 공백이 있으면 따옴표로 감싼다 — 셸이 읽는다.

## 상태 확인

```bash
systemctl status seonggwa
journalctl -u seonggwa -f                      # 한 줄 JSON 로그가 여기로 간다
journalctl -u seonggwa | grep '"level":"error"'
curl -fsS http://127.0.0.1:3000/api/health     # {"status":"ok","database":"up"}
```

헬스체크는 인증 없이 열려 있고 DB 왕복까지 본다. 비인증 응답이므로 실패해도
`{"status":"degraded"}` 와 503 만 준다 — 예외 원문은 journal 에 있다.

## 백업

```bash
deploy/backup.sh /srv/backup       # DB(VACUUM INTO) + data/ tar, 7일 롤링
```

**`cat prod.db > backup.db` 는 쓰지 않는다** — 쓰기 중인 파일을 복사하면 깨진 스냅샷이 나온다.
`backup.sh` 는 뜬 직후 `PRAGMA integrity_check` 로 열리는지 확인하고, 아니면 실패한다.

```cron
17 4 * * * /srv/seonggwa/deploy/backup.sh /srv/backup >> /var/log/seonggwa-backup.log 2>&1
```

복원은 **월 1회 리허설**한다. 리허설이 없는 백업은 백업이 아니다.

```bash
sudo systemctl stop seonggwa
sudo -u seonggwa rm -f /srv/seonggwa/prisma/prod.db-wal /srv/seonggwa/prisma/prod.db-shm
sudo -u seonggwa cp /srv/backup/db-2026-09-03.db /srv/seonggwa/prisma/prod.db
sudo systemctl start seonggwa
```

DB 는 기동 때 WAL 로 바뀐다(`enableWal`). **복원 전에 `prod.db-wal`·`prod.db-shm` 을 지운다** — 남은 WAL 이
복원한 파일 위에 다시 적용되면 옛 쓰기가 새 파일을 덮는다. 백업은 `VACUUM INTO` 라 WAL 까지 반영된 한 파일이다.

## nginx 가 반드시 해야 하는 것

`nginx.conf` 의 세 줄은 취향이 아니라 앱이 기대는 것이다. `src/lib/deployConfig.test.ts` 가 강제한다.

| 설정 | 없으면 |
|---|---|
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` | 로그인 레이트리밋이 IP 를 못 가려 모든 시도가 한 바구니에 들어간다 |
| `proxy_buffering off` | 배치 진행률(SSE)이 버퍼에 갇혀 화면이 멈춘 것처럼 보인다 |
| `proxy_read_timeout 3600s` | 50개사 분석이 1분에 끊긴다 |
| `proxy_set_header Host $host` | Auth.js 가 `UntrustedHost` 로 세션 요청을 전부 막는다 |

## PostgreSQL 로 옮길 때

지금은 SQLite 다. 옮기려면 코드 변경이 따른다 — 결정 전에 비용을 보고 판단할 것.
`docs/2026-09-03-production-readiness.md` §4 에 조용히 깨지는 곳 넷과 순서가 적혀 있다.

## 검증 상태

- `next start` 부팅 → `/api/health` 200 · 보안 헤더 7종 · `/dashboard` → `/login` 307 — **확인함**
- 환경변수를 빼고 띄우면 빠진 키를 전부 적고 뜨지 않음 — **확인함**
- `nginx.conf`·`seonggwa.service`·`deploy.sh`·`backup.sh` 의 요구사항 — `src/lib/deployConfig.test.ts` 가 강제
- **systemd·nginx 실기동은 서버가 있어야 확인된다.** 첫 배포에서 `systemctl status` 와
  `nginx -t` 를 먼저 볼 것. `better-sqlite3` 는 네이티브 모듈이라 서버에서 `npm ci` 해야 한다 —
  다른 기계에서 만든 `node_modules` 를 그대로 옮기면 런타임에 죽는다.
