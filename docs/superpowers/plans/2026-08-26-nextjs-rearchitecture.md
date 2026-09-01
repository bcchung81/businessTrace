# 성과돋보기 재구축 구현계획: Next.js 풀스택

> **2026-09-01 — Python 사이드카는 폐기했다.** 맡기려던 딥리서치(Task 15)와 dartlab 재무 정규화(Task 6)가
> 둘 다 사라져 소비자가 없는 계층이 됐다. 아래 본문에 남은 사이드카 서술은 그때의 기록이며,
> 지금 만들 것이 아니다. 복원이 필요하면 `git log -S "FastAPI"`.

**작성일:** 2026-08-26
**갱신:** 2026-08-26 — 설치본 기준 Next.js 16.3.3으로 현행화 (v15 표기 정정, v16 breaking change 반영)
**갱신 2:** 2026-08-26 — LLM 공급자 Anthropic 확정, 실행 순서를 핵심 루프 우선으로 재배치, 경로·환경변수 불일치 정정. 실행 단위 플랜은 `2026-08-26-phase0-core-loop.md` 로 분리
**역할:** 이 문서는 **마스터 로드맵**이다 — 결정·순서·리스크를 담는다. 태스크별 파일·인터페이스·테스트 코드는 페이즈별 실행 플랜에 둔다. 외부 API 스펙의 단일 출처는 `.claude/skills/external-apis/SKILL.md` 다
**Flask 기반 이전 플랜을 대체 — 스택 전환 및 차용 요소 반영.** 폐기본은 2026-08-27 삭제했고 고유 내용(기본 가중치·리스크 키워드)은 Task 11·12 로 이관했다. 원본이 필요하면 `git log --diff-filter=D -- docs/superpowers/plans/2026-08-26-p0-trust-verification.md` 로 찾는다

**목표:** 뉴스+AI 기반 기업 분석 프로덕션을 Next.js 풀스택으로 재구축한다. 환각 검증·DART/국세청 연동·리스크 모니터링·벤치마킹·XAI·연도별 이력 트래킹을 포함해 우수기업 선정의 신뢰성·객관성을 강화한다.

**대응 요구사항 (과제계획서):**
- [리스크] AI 환각 방지 → 다층 검증 파이프라인 (출처 인용 + LLM judge + evidence-match + 반증 분석)
- [Do] 평가위원회 제공 AI 다차원 분석자료, 연도별 시상·성과 관리
- [KPI] 우수기업 50개사 선정, 홍보채널 확대, 만족도 제고

---

## 아키텍처

```
[브라우저]
    │
[Next.js 풀스택 앱]  ── Prisma ──→ [SQLite/PostgreSQL]
    │  - App Router 화면 (Tailwind + shadcn/ui + Recharts)
    │  - Route Handlers: 뉴스수집·GPT분석·검증·벤치마킹·리포트 API
    │  - SSE: 분석 진행률 스트리밍
    │
    │            - /finance    : dartlab 재무 정규화·비율 계산
    │            - /health     : 헬스체크
    │
    ├──HTTPS─→ 외부 API: 국세청(휴폐업) · OpenDART(공시·재무)
    │                    네이버/구글 뉴스
    └──SMTP──→ 이메일 발송 (리포트 배포)
```

**역할 분리 원칙:**
- Next.js: 화면, 일반 CRUD, 뉴스 수집, GPT 분석, 검증, 벤치마킹, 리포트 생성 — 전부 TypeScript 단일 스택
- 배포: Docker Compose (next-app 1컨테이너) — 기존 Ubuntu VPS 또는 클라우드

## 저장소 구조 (2026-08-26 확정)

**Next.js 를 저장소 루트에 둔다.**

```
project1000/
├── src/  next.config.ts  package.json      주 앱 (루트)
├── prisma/                                  Task 2
│   ├── pyproject.toml                       uv, requires-python 핀
│   ├── app/  tests/  Dockerfile  .dockerignore
├── scripts/
│   ├── setup.sh  dev.sh                     실행환경 구축·동시 기동
│   ├── api_smoke_test.py                    외부 API 실증
├── deploy/
│   ├── docker-compose.yml  docker-compose.prod.yml
│   └── Dockerfile.web                       Next.js standalone 멀티스테이지
├── docs/  backup/
├── .dockerignore
└── .env.example                             필요한 키 이름 전부 (값 없음)
```

**루트 유지 근거:**
- `next dev` 가 `generate-agent-files.js:90` 의 `writeAgentFiles(projectDir)` 로 프로젝트 루트에 `AGENTS.md`·`CLAUDE.md` 를 재생성한다. Next 를 하위로 옮기면 `web/CLAUDE.md` 가 새로 생성되어 루트 `CLAUDE.md` 와 이원화되고, 매 `next dev` 마다 재발한다
- 분리안의 실질 이점(빌드 컨텍스트 격리)은 `.dockerignore` 로 상쇄된다
- shadcn·vitest·eslint 가 이미 루트 기준으로 검증 완료됐다

**분리안으로 전환할 트리거** (하나라도 충족되면 재검토):
- 두 번째 Python 서비스가 생긴다 (워커, 크론 등)
- 서비스별로 배포 파이프라인을 분리해야 한다

**경계 강화** (암묵적 경계가 실제로 샌 전례가 있다 — ESLint 가 `backup/` 레거시 JS 를 훑어 경고 21건 발생):
- `.dockerignore` 로 웹 이미지에서 `backup/`·`docs/`·`.next/` 제외
- Python 파일은 `scripts/` 아래에만 둔다

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16.3.3 (App Router, TypeScript, Turbopack 기본, React 19.2) |
| UI | Tailwind CSS + shadcn/ui + Recharts(차트) + TanStack Table(랭킹) |
| DB/ORM | Prisma + SQLite (개발) → PostgreSQL (운영 전환 가능) |
| 인증 | Auth.js `next-auth@5.0.0-beta.32` (peer `next ^16.0.0` 확인, 2026-08-26) — Credentials + JWT 세션, 라우트 보호는 `proxy.ts`(구 middleware). 레거시 비밀번호는 werkzeug `scrypt:32768:8:1$` 형식 — Node `crypto.scrypt` 로 검증 |
| LLM | **Anthropic** `@anthropic-ai/sdk` — 모델 ID 는 `ANTHROPIC_MODEL` 환경변수 1곳에서 관리, 기본 **`claude-sonnet-5`** (2026-08-26 결정, $2/$10 per MTok). 분석·judge 는 `thinking: {type:"adaptive"}` + `output_config.format` 구조화 출력. 50개사 일괄은 Message Batches API(50% 단가) 검토 |
| 검증 | Vitest + Testing Library + jsdom (`@vitejs/plugin-react`, `vite-tsconfig-paths`) |
| 엑셀 | exceljs |
| 배포 | Docker Compose (next-app, db) |

## Next.js 16 반영 사항 (설치본 `node_modules/next/dist/docs/` 확인)

플랜 초안은 Next.js 15 기준이었으나 실제 설치본은 **16.3.3**이다. 전 태스크에 걸쳐 아래 변경점을 전제로 구현한다.

| 변경점 | 영향 태스크 | 대응 |
|---|---|---|
| **Async Request APIs (필수)** — `cookies`·`headers`·`draftMode`·`params`·`searchParams`가 Promise. v15의 동기 접근 호환 제거 | Task 2(인증), 4·5·5b·9·11~15(Route Handler 전반) | 전부 `await` 접근. `npx next typegen`으로 `PageProps`/`LayoutProps`/`RouteContext` 타입 헬퍼 생성해 타입 안전 확보 |
| **`middleware.ts` → `proxy.ts`** — 파일·named export 모두 개명, 런타임은 `nodejs` 고정(edge 미지원), `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize` | Task 2(Auth.js 라우트 보호) | `src/proxy.ts`에 `export function proxy(request)` 로 작성. Auth.js 문서의 middleware 예제를 그대로 복사하지 말 것 |
| **Turbopack 기본** — dev·build 모두 Turbopack, 설정 위치가 `next.config.ts`의 `turbopack` 키로 이동 | Task 1, 16(빌드) | webpack 커스텀 설정 도입 금지. 필요 시 `turbopack` 키 사용 |
| **ESLint Flat Config 기본, `next lint` 제거** | Task 1 | `eslint.config.mjs` 유지, `npm run lint`는 `eslint` 직접 실행 |
| **캐싱 API 개편** — `revalidateTag`/`updateTag`/`refresh`, `cacheLife`/`cacheTag`, PPR | Task 5(corp code 24h 캐시) | corp code 는 수 MB zip 이므로 렌더 캐시가 아니라 **Prisma 테이블(`DartCorpCode`, fetchedAt)** 에 저장하고 24h TTL 을 서비스 코드에서 판정한다. `use cache` 는 화면 렌더 캐시에만 쓴다 |
| **React 19.2 + React Compiler 지원** | Task 1, 전 UI 태스크 | 수동 `useMemo`/`useCallback` 최소화. Compiler 활성화는 Task 1에서 판단 |
| **`next/image` 기본값 변경** (`minimumCacheTTL`·`imageSizes`·`qualities`, 로컬 IP 제한, `images.domains` deprecated) | Task 1·13 UI | 외부 이미지 사용 시 `images.remotePatterns`만 사용 |

## 전제 조건 및 제약

- 모든 외부 키는 환경변수만 사용 (`.env` 실태 기준, 2026-08-26): `ANTHROPIC_API_KEY`, `NCP_APIGW_API_KEY_ID`/`NCP_APIGW_API_KEY`(네이버 API HUB), `DART_API_KEY`, `NTS_SERVICE_KEY`(나라장터 공용), `GMAIL_ADDRESS`/`GMAIL_APP_PASSWORD`, `SMTP_HOST`/`SMTP_PORT`, `AUTH_SECRET`, `DATABASE_URL`. `.env.example` 에 키 이름을 유지하고 평문 값은 금지. LLM 공급자는 환경변수로 고른다 — 기본은 Anthropic, OpenAI 로 대체 가능(`LLM_PROVIDER`)
- **LLM 공급자는 Anthropic 단일**이다. 레거시 프롬프트는 gpt-4o-mini 기준으로 튜닝됐으므로 "문구 임의 개선 금지" 원칙은 유지하되, 모델 전환 자체가 결과를 바꾼다 — Task 8 에서 레거시 결과 샘플 3건과 대조해 편차를 기록하고, 산식 버전을 `v2-anthropic` 으로 시작한다
- 외부 API 테스트 전부 mock (네트워크 의존 금지). LLM 호출도 mock — 429·타임아웃·`stop_reason: "refusal"` 케이스 포함
- 기존 DB 데이터는 **`backup/instance/news_homepage.db`** (users 10 / archives 3 / companies 42) 가 원본이다. `backup/news_homepage.db` 는 빈 파일 — 이관 스크립트가 원본 경로를 인자로 받고 건수를 단정한다
- 기존 Flask 코드(`backup/`)는 **통째로 재사용하지 않는다**. 필요하면 참조해 신규 작성하거나, 자산 성격의 것은 복사해서 쓴다
  - **복사**: `domain_press_mapping.json`(도메인→언론사 181건), `news_analyzer.py` 의 GPT 프롬프트 문자열, `routes.py:1520~2065` 의 엑셀 시트 구성·스타일, `email_service.py` 의 발송 템플릿
  - **참조 후 재작성**: `routes.py`(4,642줄), `news_service.py` 의 수집·중복제거 휴리스틱, `app.js`·`style.css`·HTML 템플릿
  - 프롬프트는 운영에서 튜닝된 자산이므로 문구를 임의로 개선하지 않는다 — 바꾸면 분석 결과가 달라진다
  - `backup/` 은 gitignore 되므로 복사해 온 것만 남는다. 폴더 정리 전 자산 추출 완료 여부를 확인할 것
- 신규 코드 주석 금지, 커밋은 태스크 단위

## 사이드카 런타임 실측 (2026-08-26) — 폐기된 계층의 기록

macOS arm64 에서 후보 버전별로 의존성 해결 + venv 설치 + import 를 실제 수행한 결과다.

|---|---|---|
| 3.12 | **FAIL** — import 시 `NameError: name 'Any' is not defined` | PASS |
| 3.13 | **FAIL** — 동일 | PASS |
| 3.14 | PASS | PASS |


**결정:** Python 3.12 핀(uv 로 강제). 딥리서치 폐기로 gpt-researcher 핀 근거는 사라졌으나, 3.14 가 기본인 로컬에서 사이드카를 재현 가능하게 두려면 핀 자체는 유지한다.

**미검증:** 위 결과는 macOS arm64 기준이다. 211개 패키지 트리의 리눅스 휠 가용성은 다를 수 있으므로 Task 3 에서 컨테이너 안에서 재검증한다 (venv 약 1.1GB).

## 외부 API 실증 결과 (2026-08-26 재실행, `scripts/api_smoke_test.py`)

| API | 결과 | 비고 |
|---|---|---|
| 국세청 휴폐업 | **PASS** | 삼성전자 계속사업자·부가가치세 일반과세자 확인 |
| DART 공시(`list.json`) | **PASS** | 삼성전자 2024년 10건, 올림플래닛 1건(감사보고서 2023.12) |
| DART 재무(`fnlttSinglAcnt`) | **PASS**(상장사만) | 삼성전자 사업보고서 30항목. 올림플래닛은 `status=013` |
| DART 사업자번호(`company.json`) | **PASS** | 삼성전자 1248100998, 올림플래닛 1208824298 |
| Anthropic | **PASS** | claude-sonnet-4-5 응답 정상 |
| 네이버 뉴스 | **PASS** | API HUB 키로 총 4,439,545건 조회 확인 |
| 나라장터 | **PASS** | 삼성전자·올림플래닛 조회 성공. 엔드포인트 정정 후 해결 |

**해결된 버그:** 국세청 호출이 401 이었던 원인은 data.go.kr **Decoding 키를 URL 에 인코딩 없이 문자열로 삽입**해 `+` 가 공백으로 해석된 것이다. 쿼리 파라미터로 넘겨 인코딩하면 200 이다. TypeScript 구현 시 `URL.searchParams.set()` 을 쓰면 자동 처리된다 — 절대 템플릿 문자열로 키를 URL 에 넣지 말 것.

**대상 기업 재무 결측이 기본값이다.** 검증 대상 5개사 중 4개사(크립토랩·넷록스·페어리·논스랩)는 DART 고유번호조차 없고, 올림플래닛은 공시는 있으나 `fnlttSinglAcnt`(상장사 대상)로는 재무제표가 나오지 않는다. 벤치마킹의 "결측 지표 제외 정규화"는 예외 처리가 아니라 **주 경로**다.

**나라장터 엔드포인트 정정 (중요):** 초안의 `ao/PubPrcrmntCorpService` 는 존재하지 않는 경로였고, 활용신청은 정상이었다. 올바른 URL 은 아래와 같으며 **서비스명에도 `02` 가 붙는다.**

```
https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02
```

`NO_OPENAPI_SERVICE_ERROR`(reasonCode 12) 는 미구독이 아니라 **경로 불일치**에서도 발생한다. 미구독이면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 온다 — 두 에러를 구분할 것. 인증키는 `NTS_SERVICE_KEY` 를 그대로 쓸 수 있어 별도 키 분리는 불필요하다.

**네이버 검색 API 이관 (2026-06~07):** 네이버가 검색 API 를 개발자센터에서 **NAVER API HUB(네이버 클라우드)** 로 이관했다. 개발자센터 애플리케이션 등록 화면의 "사용 API" 목록에 **검색·데이터랩이 더 이상 없다** — 신규 신청이 막힌 것이지 설정 실수가 아니다.

| 구분 | 개발자센터 (레거시) | NAVER API HUB (신규) |
|---|---|---|
| 도메인 | `openapi.naver.com` | `naverapihub.apigw.ntruss.com` |
| 경로 | `/v1/search/news.json` | `/search/v1/news` |
| 인증 헤더 | `X-Naver-Client-Id` / `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| 응답 필드 | `title·originallink·link·description·pubDate` | 동일 |

- 2026-06-25 HUB 정식 출시 → **2026-07-31 개발자센터 신규 신청 종료** → 2027-06-30 기존 키 지원 종료
- 현재 무료, 검색 API 통합 월 775,000건 / 키당 50 RPS, 초과 시 429. 향후 유료화 예정(단가 미정)
- **쇼핑·책·전문자료 검색은 2026-07-31 완전 종료**되어 대체 API 가 없다. 뉴스 검색은 이관 대상으로 생존
- 응답 필드가 동일하므로 파서는 재사용 가능하다. `src/lib/services/newsCollector.ts` 는 **엔드포인트·헤더만 환경변수로 분기**해 두 방식을 모두 지원한다

**HUB 스펙 실증 완료 (2026-08-26).** 실제 발급 키로 호출해 200 을 확인했다.

```
GET https://naverapihub.apigw.ntruss.com/search/v1/news?query=삼성전자&display=3&sort=date
  X-NCP-APIGW-API-KEY-ID: <Client ID>
  X-NCP-APIGW-API-KEY:    <Client Secret>
→ 200, total 4,439,545 / items[].title·originallink·link·description·pubDate
```

- 키 발급 경로: 네이버 클라우드 콘솔 → **All Services > Application Services > NAVER API HUB** → Application 등록 → 인증정보에서 Client ID/Secret 확인 (콘솔 메뉴 `AI·NAVER API > Application` 경로로도 접근)
- 키 형식: Client ID 10자 / Client Secret 40자. 개발자센터 레거시 키(ID 20자·Secret 10자)와 길이가 다르다
- **레거시 엔드포인트로는 HUB 키가 동작하지 않는다** — `NID AUTH Result Invalid (1000)`. 엔드포인트와 헤더를 한 쌍으로 바꿔야 한다
- 환경변수는 `NCP_APIGW_API_KEY_ID` / `NCP_APIGW_API_KEY` 를 쓴다. HUB 키를 `NAVER_CLIENT_ID/SECRET` 이름에 넣으면 레거시로 오인돼 실패한다
- HUB 는 API 별 개별 신청이 없다 — Application 하나로 검색(뉴스·블로그·이미지·지역·지식iN 등)과 데이터랩을 함께 쓴다

**미해결 블로커: 없음.** 외부 API 11건 전부 PASS (2026-08-26 기준)

## OSS 채택 검증 결과 (GitHub API 기준, 2026-08-26 확인)

**라이브러리 직접 차용 (의존성 추가):**
- `eddmpython/dartlab` — ★209, 최근 푸시 2026-08(활발), Apache-2.0 → Task 6 사이드카 차용 확정

**아이디어/로직 차용 (자체 구현, 코드 미채용):**
- evidence-match·반증 분석 → Task 9 (원출처 Startup-Validator는 0★, MIT — 로직만 벤치마킹)
- 산업별 가중치 루브릭 → Task 12 (startup-evaluator, 0★ — 패턴만)
- 점수화→경보 2단계 → Task 11 (news-sentiment-analysis, ★26이나 2019년 이후 방치 — 구조만 참고)
- corp code 캐시 → Task 5 (finsight, 0★ — 패턴만)

**차철회 (라이선스 리스크):**
- `2geonhyup/dart-mcp`(★128), `kgcrom/cluefin-dure`(★15) — **라이선스 부재로 코드 복사 금지**. 프롬프트 구조·에이전트 역할 분담 등 아이디어 수준 참고만 허용

**원칙:** 라이선스 없는 저장소의 코드는 한 줄도 복사하지 않는다. 아이디어 차용 시 자체 구현으로 대체한다.

## Task 목록 (TDD: 실패 테스트 → 구현 → 통과 → 커밋)

### Phase 0: 기반 구축

#### Task 1: Next.js 프로젝트 스캐폴딩
- **내용**:
  - create-next-app 스캐폴딩 (App Router, TS, Tailwind v4, ESLint flat config) — **완료됨**, Next.js 16.3.3 설치본
  - Vitest + Testing Library + jsdom 테스트 기반 구축 (`vitest.config.mts`에 `tsconfig-paths`·`@vitejs/plugin-react`, `npm test` 스크립트)
  - shadcn/ui 초기화 (Tailwind v4 모드, `components.json`, `src/lib/utils.ts`), Button 컴포넌트 도입
  - 디렉터리 규약 수립: `src/app`, `src/components/ui`(shadcn), `src/components/layout`, `src/lib/services`, `src/lib/repositories`
  - 다크모드 기본 설정 (`.dark` 클래스 기반 — `prefers-color-scheme` 전용 스캐폴딩 CSS를 교체), 공통 레이아웃(헤더/사이드바) 적용, 기본 메타데이터를 "성과돋보기"로 교체
- **검증**: `npm test` 통과(Button 렌더·레이아웃 렌더), `npm run build` 성공, `npm run lint` 통과
- **커밋**: `chore: scaffold next.js app with tailwind and shadcn/ui`

#### Task 2: DB 스키마 및 인증 — 3개로 분할 (실행 플랜 `phase0-core-loop.md`)
- **2a 스키마**: `prisma/schema.prisma` — User, Company(+businessNo, industry), Archive, AnalysisRun, VerificationResult, RiskAlert, SelectionRecord, FinancialSnapshot, DartCorpCode, ResearchJob. `.env.example` 추가. 커밋 `feat: prisma schema and database client`
- **2b 인증**: `next-auth@5.0.0-beta.32` Credentials + JWT 세션. 레거시 해시(`scrypt:32768:8:1$salt$hex`, werkzeug)를 `crypto.scrypt` 로 검증하는 `verifyLegacyPassword`, 신규 가입은 동일 형식으로 저장해 이관 전후 동작 일치. `src/proxy.ts` 라우트 보호. 커밋 `feat: credentials auth with legacy scrypt compatibility`
- **2c 이관**: `scripts/migrate-legacy.ts` — `backup/instance/news_homepage.db` → Prisma, 건수(10/3/42) 단정. 커밋 `feat: legacy sqlite migration script`
- 분할 근거: 리뷰어가 스키마는 승인하고 인증만 반려할 수 있다. Auth.js 호환 스파이크는 불필요해졌다 (peer `next ^16.0.0` 확인)

#### Task 3: Python 사이드카 스캐폴딩 — **폐기 2026-09-01**

FastAPI 스캐폴드를 세웠으나(`feat: fastapi sidecar scaffold with docker compose`), 맡기려던 두 기능이
모두 사라져 `/health` 만 남았고 그마저 부르는 곳이 없었다.

- **Task 15 딥리서치** — 폐기
- **Task 6 dartlab 정규화** — 미채택. 비율은 `financeRatios.ts` 로 Next.js 안에서 계산

계층 전체를 걷어냈다. 파이썬 전용 라이브러리가 다시 필요해지면 `git log -S "FastAPI"` 로 되짚어 복원한다.

### Phase A: 데이터 연동·검증 (P0 대응)

#### Task 4: 국세청 휴폐업 검증 — ✅ 완료 (2026-08-28)
- **파일**: `src/lib/services/nts.ts`, `src/app/api/company/business-status/route.ts`, 테스트
- **내용**: 사업자번호 10자리 검증 → 국세청 상태조회 API 호출 → 계속/휴폐업·과세유형 반환. 키 미설정·오류 시 에러 필드 처리. UI: 기업 상세에 적격성 배지(계속사업자/폐업/미확인) 표시
- **검증**: 4케이스 mock 테스트 (계속/폐업/미등록/API 오류) + 라우트 통합 테스트
- **커밋**: `feat: NTS business status verification`
- **구현 결과** (2026-08-28): 테스트 11건. 실 API 확인 — 삼성전자·올림플래닛 모두 `계속사업자 / 부가가치세 일반과세자`, 미등록 번호와 형식 오류는 `checked=false`
- **원칙**: 조회 실패는 **폐업이 아니라 미확인**이다. `isActive` 를 `boolean | null` 로 두어 "확인 결과 부적격"과 "확인 못 함"을 구분한다. 실패를 부적격으로 읽으면 선정에서 부당하게 탈락한다

#### Task 5: DART 재무 수집 + corp code 캐시 + 사업자번호 자동조회 — ✅ 완료 (2026-08-28)
- **파일**: `src/lib/services/dart.ts`, `src/lib/cache/corpCode.ts`, `src/app/api/company/financial/route.ts`, `src/app/api/company/business-no/route.ts`, 테스트
- **내용**:
  - OpenDART REST 직접 호출 (고유번호 파일 1회 다운로드 → 로컬 캐시 24h TTL — finsight 패턴 차용)
  - `getFinancialSummary(기업명, 연도)`: 매출액·영업이익·당기순이익·자산총계 반환, 라벨 별칭 1차 매핑
  - 기업 미발견·보고서 부재 시 명시적 에러 (리포트에 "미제공" 구분 표기)
  - **사업자번호 자동조회**: OpenDART 기업개황 API(`company.json`)의 `bizr_no`로 사업자번호·법인번호·대표자·업종코드 확보 — 실증 완료(올림플래닛 1208824298 조회 성공, 2026-08-26 smoke 테스트). DART 미등록 기업은 미발견 처리(정상 케이스)
  - **동명 기업 처리**: 기업명 검색 결과가 복수면 후보 리스트(정식명칭·대표자·주소)를 반환해 관리자가 선택
  - API smoke 검증 결과 반영: 대상 5개사 중 3개사는 DART 미등록(정상), 재무제표 전무 — "미제공" 폴백 필수
- **검증**: 캐시 TTL 동작/정상 조회/기업 없음/키 없음/동명 후보 반환/사업자번호 조회 mock 테스트
- **커밋**: `feat: DART financial service with corp code cache and business number lookup`
- **구현 결과** (2026-08-28): 테스트 21건 추가(전체 234건). 실 API 로 확인 — corp code **118,804건** 캐시(10.8초), 삼성전자 사업자번호 1248100998·매출 300.9조, 올림플래닛 사업자번호 1208824298·재무는 `013 조회된 데이타가 없습니다`(비상장 정상), 크립토랩·넷록스는 DART 미등록
- **실측 함정**: DART `corpCode.xml` 은 **ZIP** 이다. `node:zlib` 의 `unzipSync` 는 gzip/deflate 전용이라 `incorrect header check` 로 죽는다 — `fflate` 로 풀어야 한다. **mock 이 이 결함을 가렸다**: `unzip` 을 주입 가능하게 만들어 놓고 테스트에서 항상 대체해 실제 경로가 한 번도 실행되지 않았다. 실제 zip 을 만들어 통과시키는 테스트를 추가해 고정했다

#### Task 5b: 나라장터 조달업체 프로파일 (조달청) — ✅ 완료 (2026-08-28)
- **파일**: `src/lib/services/narajangteo.ts`, `src/app/api/company/procurement/route.ts`, 테스트
- **내용**:
  - 공공데이터포털 [조달청_나라장터 사용자정보 서비스](https://www.data.go.kr/data/15129466/openapi.do) 연동 (무료, 개발계정 10,000/일)
  - **실측 확정 스펙 (2026-08-26 재검증)**: `https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02` + `inqryDiv=3` + `bizno` — **사업자번호 기준 조회만 지원, 업체명 역검색 없음**. 서비스명의 `02` 누락 시 `NO_OPENAPI_SERVICE_ERROR`
  - **응답 필드 실측**: `corpNm`·`ceoNm`·`adrs`·`telNo`·`hmpgAdrs`·`opbizDt`(개업일)·`emplyeNum`(종업원수)·`corpBsnsDivNm`(조달업무구분)·`mnfctDivNm`(제조구분). 올림플래닛 종업원 75명·물품/일반용역/용역 확인 — `emplyeNum` 은 Task 12 벤치마킹 지표 후보
  - **역할**: 독립 조회 수단이 아니라 **OpenDART(사업자번호 확보)의 후속 단계** — 번호가 있을 때 조달 프로파일(업체명·대표자·주소·종업원수·조달업무구분) 보강
  - 실증 결과: 삼성전자·올림플래닛 조회 성공. DART 미등록 + 번호 미보유 기업은 이 단계도 불가 → "미확인" 유지
  - 부가 가치: 조달 실적·업종·종업원수를 Task 12 벤치마킹 지표 후보로 확장 가능 (지표화는 후속)
  - 참고 구현: `opendata-kr/narajangteo-corpinfo-mcp` (MIT — 오퍼레이션·파라미터 참고 가능)
- **검증**: 번호 기반 조회/미등록/Encoding 키 오류 처리 mock 테스트
- **커밋**: `feat: narajangteo procurement profile lookup`
- **구현 결과** (2026-08-28): 테스트 8건. 실 API 확인 — 삼성전자 종업원 121,927명, 올림플래닛 75명·물품/일반용역/용역
- **DART 에 재무가 없어도 여기선 잡힌다.** 올림플래닛은 `fnlttSinglAcnt` 가 013 이지만 조달청에는 종업원수·조달업무구분이 있다. Task 12 벤치마킹의 결측 보완 지표로 쓸 수 있다
- 에러 코드 구분을 코드로 고정했다 — `NO_OPENAPI_SERVICE_ERROR` 는 경로 불일치, `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 가 미구독

#### 통합 라우트 `POST /api/companies/[id]/dart`

기업명 하나로 DART → (사업자번호) → 국세청·나라장터를 잇는다. 실측 결과:

```
DART    : (주)올림플래닛 사업자번호=1208824298 대표=권재현
재무    : found=False  013 조회된 데이타가 없습니다  (비상장 정상)
국세청  : checked=True active=True 계속사업자 / 부가가치세 일반과세자
나라장터: found=True 종업원=75 물품,일반용역,용역
저장됨  : businessNo=1208824298 industry=58222
```

사업자번호는 `Company.businessNo` 에 저장되므로 기업 표의 "미확인" 경고가 해소된다.

#### Task 6: dartlab 재무 정규화·비율 (사이드카)
- **파일**: `sidecar/app/routers/finance.py`, `src/lib/services/financeNormalized.ts`, 테스트
- **내용**:
  - 사이드카 `/finance/normalize`: dartlab으로 계정과목 정규화 + ROE·부채비율·영업이익률 등 비율 사전계산 (dartlab 차용)
  - Next.js는 결과를 FinancialSnapshot으로 저장 — Task 5의 라벨 별칭 수작업 매핑을 보완하는 2차 정규화 계층
  - dartlab 미지원 기업(비상장 등) 시 Task 5의 1차 매핑 결과로 폴백
- **검증**: 정규화 성공/폴백 동작/사이드카 다운 시 에러 처리 mock 테스트
- **커밋**: `feat: dartlab financial normalization via sidecar`

**실측 (2026-09-01) — 착수 전 재검토가 필요하다.** dartlab 0.11.0(PyPI, Apache-2.0)을 설치해 API 를 확인한 결과
진입점이 `dartlab.company.Company(stockCode)` 로 **종목코드 기반, 즉 상장사 전용**이다.

- 50개사 중 종목코드 보유는 **4개사**뿐이다 (아크릴·핀텔·한국첨단소재·케이앤에스아이앤씨)
- 그 4개사는 **이미 재무를 확보한 기업들**이다 — dartlab 은 커버리지를 넓히지 못하고 비율만 더한다
- 정작 비율이 없는 46개사(비상장)는 dartlab 이 손대지 못한다. Task 5 폴백이 사실상 전부가 된다
- 감사보고서 원문 파서(`dartAuditReport.ts`)가 이미 자산·부채·자본 총계 행을 읽을 수 있어, 비율은 사이드카 없이도 낼 수 있다

선택지: (a) 계획대로 dartlab 을 붙이고 46개사는 폴백 · (b) dartlab 을 채택하지 않고 비율을 자체 계산 ·
**결정 (2026-09-01): (b) 채택.** dartlab 을 쓰지 않고 감사보고서·정기보고서에서 부채·자본 총계를 마저 뽑아 비율을 자체 계산한다 (`financeRatios.ts`). Task 6 은 이로써 닫는다.

#### Task 7: 뉴스 수집 이관 (TS)
- **파일**: `src/lib/services/newsCollector.ts`, `src/app/api/news/route.ts`, 테스트
- **내용**: 네이버 뉴스 API + 구글 뉴스 RSS 수집을 TS로 재구현 (fetch + rss-parser), 중복 제거·언론사 매핑 유지, 기존 `domain_press_mapping.json` 복사 재사용. 기간 필터·건수 옵션 동일
  - **기사 본문 크롤링을 수집 단계에 포함** (`articleBody.ts`, cheerio). 구글 RSS 링크는 base64 디코드로 원문 URL 복원. 레거시가 구글 뉴스에 쓰던 OpenAI `web_search_preview` 경로는 **이관하지 않는다** — 본문을 직접 확보하면 LLM 웹검색이 불필요하고 검증 층③ 이 원문을 얻는다 (2026-08-27 결정)
  - 네이버는 **API HUB 방식을 기본**으로 하고 레거시 개발자센터 방식을 환경변수로 분기 (응답 필드 동일하므로 파서 공용)
  - 50 RPS 제한·429 응답 처리, 월 775,000건 한도를 고려한 호출량 로깅
- **검증**: 파싱/중복제거/필터 단위 테스트 (샘플 RSS·API 응답 fixture 사용)
- **커밋**: `feat: news collection service in typescript`

#### Task 8: GPT 분석 엔진 이관
- **파일**: `src/lib/services/analyzer.ts`, `src/app/api/analyze/route.ts` (SSE), 테스트
- **내용**: 동향·수상·투자·종합 분석을 `@anthropic-ai/sdk` 로 재구현. 레거시 프롬프트 문구는 그대로 옮기되 JSON 추출 휴리스틱(`_extract_and_parse_json`)은 `output_config.format` 구조화 출력 + zod 검증으로 대체. `thinking: {type:"adaptive"}`, 스트리밍 필수(`client.messages.stream`). SSE 진행률 이벤트(단계별) 제공. 분석 결과는 AnalysisRun 으로 저장, 산식 버전 `v2-anthropic`
  - 레거시 gpt-4o-mini 결과 샘플 3건과 대조해 감성 라벨·수상/투자 판정 편차를 `docs/incidents.md` 가 아닌 실행 플랜 완료 노트에 기록
- **검증**: 구조화 출력 파싱/429 재시도/`refusal` 처리/SSE 이벤트 순서 mock 테스트
- **커밋**: `feat: GPT analysis engine with SSE streaming`

#### Task 9: 다층 환각 검증기
- **파일**: `src/lib/services/verification.ts`, `src/app/api/verification/route.ts`, 테스트
- **내용**:
  - 1층: 출처 인용 검사 (링크 존재·URL 형식, 출처커버리지)
  - 2층: LLM-as-judge 근거충실도 — Anthropic `ANTHROPIC_MODEL`, `output_config.effort: "low"` 로 결정성 확보 (Sonnet 5 는 `temperature` 파라미터를 거부하므로 쓰지 않는다), 구조화 출력으로 문장별 채점 JSON 강제
  - 3층: **evidence-match 점수** — 분석결과와 원문의 어휘적 겹침 측정 (LLM 호출 없이 계산 — Startup-Validator 차용)
  - 4층: **반증 분석** — "이 평가가 틀릴 수 있는 이유" 자동 생성 (judge 프롬프트에 포함, 평가위원회 자료의 유의사항으로 활용)
  - 판정: faithfulness ≥ 0.85 AND 출처커버리지 ≥ 0.5 AND evidence-match ≥ 0.4 → verified, 미달 시 needs_review
  - 검증 실패·오류 시 무조건 needs_review (검증 실패 = 신뢰 불가)
  - 결과를 VerificationResult에 저장, 분석 파이프라인 완료 시 자동 실행 + SSE 이벤트
- **검증**: 층별 단위 테스트 + 판정 경계값 테스트 (7케이스 이상)
- **커밋**: `feat: multi-layer hallucination verification`

#### Task 10: 엑셀 리포트 통합
- **파일**: `src/lib/services/reportExcel.ts`, 테스트
- **내용**: exceljs로 리포트 생성 — 기존 구성(뉴스·종합의견) + 신설 시트: "다차원 검증"(재무/적격성/검증상태/반증 요약). 이메일 발송(SMTP) 연동
- **검증**: 시트 구성/옵션 데이터 누락 시에도 생성/이메일 mock 테스트
- **커밋**: `feat: excel report with verification and research sheets`

### Phase B: 선정·관리 체계

#### Task 11: 리스크 모니터링
- **파일**: `src/lib/services/riskMonitor.ts`, `prisma` RiskAlert, `src/app/api/company/risk-alerts/route.ts`, UI 컴포넌트, 테스트
- **내용**:
  - 카테고리별 리스크 키워드 사전 — **처벌·제재·소송·기소·압수수색·배임·횡령·리콜·환수·분쟁**. 뉴스 스캔 → **점수화 → 임계치 초과 시 경보** 2단계 구조 (news-sentiment-analysis 패턴 차용)
  - dartlab 급변동 감지(재무) 신호도 리스크로 추가 (Task 6 연계)
  - 심각도는 참고 수준 — **담당자 확인 플래그 필수, 확인된 알림만 감점 적용** (오탐 방지)
  - UI: 알림 목록 + 확인 처리 버튼, 엑셀 "리스크" 시트 반영
- **검증**: 키워드 매칭/점수화/임계치/확인 플래그 테스트
- **커밋**: `feat: risk monitoring with alerts and review workflow`

#### Task 12: 벤치마킹 랭킹 (산업별 루브릭)
- **파일**: `src/lib/services/benchmarking.ts`, `src/lib/services/rubrics.json`(`config/` 는 새 최상위 디렉터리라 두지 않았다), `src/lib/repositories/benchmarkInputs.ts`, `src/lib/services/rankingExcel.ts`, `src/app/api/companies/benchmark/route.ts`, `src/app/ranking/page.tsx` + `src/components/ranking/ranking-table.tsx`(자체 표 — Segmented·Panel 재사용, TanStack 미채택), 테스트 — **완료 2026-08-30**, 실행 플랜 `docs/superpowers/plans/2026-08-30-benchmarking-ranking.md`
- **내용**:
  - 지표: 뉴스 감성, 수상·투자 실적, 재무(정규화 비율), 검증상태(verified 가점), 리스크(확인된 것만 감점)
  - **산업별 가중치 루브릭**을 JSON 설정으로 분리 (ICT/제조/바이오 등 — startup-evaluator 패턴 차용), Company.industry 필드 기반 적용
  - 산업 무관 **기본 가중치**: 감성 0.3 / 수상 0.2 / 투자 0.2 / 재무 0.2 / 검증 0.1, 리스크는 감점. 산업별 루브릭이 없는 기업에 이 값을 쓴다
  - min-max 정규화, 결측 지표 제외 정규화, 총점·순위 산출
  - UI: 랭킹 테이블(정렬·필터), 엑셀 랭킹 시트, 가중치 명시 표기
- **검증**: 정규화/순위/결측 처리/산업별 루브릭 적용 테스트
- **커밋**: `feat: industry-weighted benchmarking ranking`

#### Task 13: XAI 기여도 리포트 & AlphaSense형 인터랙티브 인용 UI
- **파일**: `src/lib/services/explainer.ts`, `src/lib/repositories/explainInputs.ts`, `src/app/api/companies/[id]/explain/route.ts`, UI `src/components/company/{contribution-bars,opinion-citations,verification-panel}.tsx`(Recharts 미사용 — 막대는 div, 인용 매핑은 `containment` 바이그램·임계 0.5), 엑셀 "기여도" 시트, 테스트 — **완료 2026-08-30**, 실행 플랜 `docs/superpowers/plans/2026-08-30-explainer-citations.md`
- **내용**:
  - 벤치마킹 총점을 지표별 기여도로 분해(규칙 기반, LLM 호출 없음), 근거 요약(뉴스 헤드라인 3건·DART 수치·검증상태) 조립. UI: 기여도 수평 막대 차트. 엑셀에 기여도 행 추가
  - **AlphaSense/Hebbia 벤치마킹 (인터랙티브 인용 UI)**:
    - 화면상 AI 종합의견·주장 문장에 마우스 오버 시 일치하는 원문 기사 본문 단락(Snippet)을 실시간 하이라이트/팝오버로 표시
    - 검증 상태 배지(`verified` / `needs_review`) 클릭 시 Layer 1~4 검증 근거(출처 링크, 근거 충실도 점수, 반증 사유)를 사이드 패널로 즉시 펼쳐 확인하는 UI 구현
- **검증**: 기여도 합계 100%/결측 처리/근거 조립/인용 하이라이트 매핑 테스트
- **커밋**: `feat: explainable score breakdown and interactive citation ui`

#### Task 14: 연도별 이력 트래킹·시상
- **파일**: `src/lib/services/history.ts`, SelectionRecord, `src/app/api/companies/{history,awards}/route.ts`, UI(라인 차트·수상 목록), 테스트
- **내용**: 시상 확정 시 기록 저장(등급·총점·지표 점수·산식 버전), 연도별 점수 추이 조회, 시상 카테고리 자동 산출("3년 연속 우수", "전년 대비 최다 성장", "신규 최고 점수"). UI: 추이 라인 차트(Recharts), 연도별 수상자 화면
- **검증**: 이력 저장/추이/카테고리 산출 테스트
- **커밋**: `feat: selection history tracking and award categories`

#### Task D: 기업 상세 "확인 필요" 블록 — **완료 2026-08-30**
- **파일**: `prisma` SourceDecision · Company.aliases · VerificationResult.reviewed*, `src/lib/repositories/{sourceDecision,reviewItems}.ts`, `src/lib/services/{refreshSources,collectForCompany}.ts`, `src/app/companies/[id]/actions.ts`, `src/components/company/review-block.tsx`, 실행 플랜 `docs/superpowers/plans/2026-08-30-review-block.md`
- **내용**: 동명 충돌 후보 확정(국민연금 앞 6자리·DART 고유번호/미등록)이 재조회에 고정됨 · 검증 검토 기록 · 미확인 경보·주의 사건 확인 · 검색 별칭(수집 질의에 합침) · 사업자번호 입력 후 즉시 원천 대조

#### Task C: 일괄 분석 실행 화면 — **완료 2026-08-30**
- **파일**: `src/lib/services/{batchRegistry,batchRun,batchProgress}.ts`, `src/app/api/analyze/{batch,status}/route.ts`, `src/components/analysis/batch-runner.tsx`, `src/components/layout/batch-indicator.tsx`, 실행 플랜 `docs/superpowers/plans/2026-08-30-batch-runner.md`
- **내용**: `/companies` 에서 다중 선택 → SSE 로 순차 실행 · 4단 스테퍼 · 헤더 진행 배지(프로세스 메모리 레지스트리, 인스턴스 1개 전제) · 등록 직후 실행 링크. 자동 스케줄은 두지 않았다(사용자 결정)

### Phase C: 검증 엔진 고도화

> **딥리서치(구 Task 15·15b)는 2026-09-01 에 폐기했다.** STORM 다관점 딥리서치와 그에 딸린
> RAGAS 임계값 튜닝을 함께 걷어냈다. 근거는 `docs/incidents.md` 가 아니라 이 결정 자체다 —
> 필요해지면 이 커밋을 되짚어 복원한다(`git log -S "STORM"`).

#### Task 16: 배포 패키징
- **파일**: `deploy/Dockerfile.web`(next-app, multi-stage), `deploy/docker-compose.prod.yml`, 배포 문서
- **내용**: 웹 1컨테이너 프로덕션 구성(Next.js standalone 빌드), 환경변수 주입, SQLite 볼륨(또는 PostgreSQL 서비스), 헬스체크·재시작 정책, 기존 Ubuntu 서버 배포 가이드 갱신
- **검증**: Compose 기동 → 로그인 → 분석 1회 → 리포트 다운로드 E2E 수동 확인
- **커밋**: `chore: production docker packaging`

---

## 실행 순서 및 의존성

**원칙: 제품의 존재 이유(환각 검증)를 외부 재무 데이터 없이 먼저 완주한다.**

```
Task 1 → 2a → 2b → 2c                       (Phase 0 기반)
      → Task 7 → Task 8 → Task 9 → Task 10  (핵심 루프: 수집→분석→검증→리포트)
Task 10 이후 병렬:
  ├─ Task 4 (국세청) · Task 5 → 5b (DART·나라장터)   외부 데이터 보강
  └─ Task 11 · Task 12 → 13 (AlphaSense 인용 UI) · Task 14   Phase B
Task 16 (배포) — 전부 완료 후
```


## 리스크 및 대응

| 리스크 | 대응 |
|---|---|
| Vercel 서버리스 제약 | Docker Compose 자체호스팅 전제 (기존 Ubuntu VPS) |
| React 전환 학습 비용 | shadcn/ui 표준 컴포넌트 중심으로 자체 UI 로직 최소화 |
| Next.js 16 신규 릴리스로 서드파티(Auth.js·Prisma·shadcn) 호환 미검증 | 각 태스크 착수 시 설치본 문서(`node_modules/next/dist/docs/`) 우선 확인, 비호환 라이브러리는 자체 구현으로 폴백 |
| v15 기준 블로그·예제 코드가 v16에서 실패 (동기 `cookies()`, `middleware.ts`) | 외부 예제 복사 금지, 설치본 문서 기준으로 작성 |
| 비상장기업 재무 부재 | "미제공" 명시 표기, 벤치마킹 시 결측 지표 제외 정규화 |
| LLM judge 오판 | 다층 검증(4층) + 임계치 미달 시 사람 검토 게이트 |
| 리스크 키워드 오탐 | 담당자 확인 플래그 필수, 확인된 알림만 감점 |
| 연도별 점수 산식 변경 | SelectionRecord에 산식 버전 필드, 버전 간 비교 시 주석 |
| 기존 데이터 이관 실패 | 이관 스크립트 + 건수·샘플 검증 절차, 이관 전 DB 백업 |
| 리눅스 휠 가용성 미검증 (실측은 macOS arm64) | Task 3 에서 컨테이너 내 재검증, 실패 시 파이썬 버전 재선택 |
| 네이버 검색 API 가 NAVER API HUB 로 이관 (개발자센터 신규 신청 종료) | 네이버 클라우드에서 키 발급 후 `NCP_APIGW_API_KEY_ID/KEY` 설정. 수집기는 엔드포인트·헤더를 환경변수로 분기 |
| HUB 가 향후 유료화 예정 (단가 미정) | 월 775,000건 무료 한도 내 운영, 50개사 일괄 분석 시 호출량 로깅. 유료화 시 구글 뉴스 RSS 비중 확대 |
| 네이버 쇼핑·책·전문자료 검색 완전 종료 | 해당 소스 사용 계획 없음 — 뉴스 검색만 사용 |
| data.go.kr Decoding 키를 URL 에 직접 삽입하면 `+` 가 공백으로 깨짐 | 쿼리 파라미터로 전달해 인코딩 (`URL.searchParams.set`), 템플릿 문자열 금지 |
| Anthropic 429·과금 — 50개사 × (분석 N건 + judge) 호출 폭증 | SDK `maxRetries` 기본 2 + 동시성 상한(기업 단위 3 병렬), 시스템 프롬프트 `cache_control` 로 프롬프트 캐시, 일괄 처리는 Message Batches API(50%) 검토. `AnalysisRun` 에 `usage` 토큰 저장해 건당 비용 가시화 |
| Sonnet 5 가 `temperature`/`top_p` 를 거부(400) — 레거시 `temperature=0.3`·judge `temperature=0` 이관 불가 | 샘플링 파라미터를 보내지 않는다. 결정성은 `output_config.effort: "low"` + 구조화 출력으로 확보 |
| 모델 전환(gpt-4o-mini → Sonnet 5)으로 레거시 대비 분석 결과 편차 | 산식 버전 `v2-anthropic` 으로 이력 구분, Task 8 에서 샘플 3건 대조 기록 |

## 완료 정의 (Definition of Done)

- 전체 테스트 통과 (`vitest run`), 프로덕션 Compose 기동 확인
- E2E 시나리오: 로그인 → 기업 50개사 등록(사업자번호·산업 포함) → 일괄 뉴스 분석(SSE 진행률) → 자동 검증(다층) → 벤치마킹 랭킹 → XAI 기여도 확인 → 딥리서치 1건 → 엑셀 리포트(다차원 검증·리스크·심층조사 시트) 다운로드
- 소스코드에 평문 API 키 없음, `.env.example` 이 실제 필요한 키 이름과 일치
- 기존 DB 데이터 이관 완료 검증 — `scripts/migrate-legacy.ts` 가 users 10 / archives 3 / companies 42 를 단정
- 측정치: 50개사 일괄 분석(기업당 뉴스 ≤ 30건)이 **60분 이내**, 토큰 비용이 `AnalysisRun.usage` 합산 기준 **$30 이하** (Sonnet 5 단가). 초과 시 동시성·프롬프트 캐시·Batches 순으로 조정
- 검증 임계값(0.85/0.5/0.4)은 초기값이다 — 레거시 결과 샘플 10건에 적용해 verified 비율을 완료 노트에 기록하고, 판정 근거 없이 임계값을 낮추지 않는다
