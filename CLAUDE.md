# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` is generated and re-written by `next dev`. Never put project knowledge there — it will be overwritten.

---

## 1. 제품

**성과돋보기** — 뉴스와 공공·금융 데이터를 AI로 분석해 **우수기업 50개사** 선정 근거를 만들고, 평가위원회에 다차원 분석자료를 제공한다.

**핵심 요구사항은 AI 환각 방지다.** 분석 결과를 공식 출처와 대조해 자동 검증하는 것이 제품의 존재 이유이고, 검증을 통과하지 못한 분석은 `needs_review` 로 남겨 사람이 확인하게 한다. 자동 통과시키지 않는다.

- **관리자 전용 도구다.** 공개 회원가입이 없고 계정은 운영자가 CLI 로 발급한다. 자율 가입은 향후 확장 사항
- 기존 Flask 앱(`backup/`, gitignore)을 **Next.js 풀스택 + Python 사이드카**로 재구축 중
- **레거시 데이터는 이관하지 않는다.** 신규 시스템을 실행해 새로 만든다

## 2. 현재 상태 (2026-08-28)

테스트 **253건 / 33파일** 통과, `npm run lint`·`npm run build` green.

| 구분 | 태스크 | 상태 |
|---|---|---|
| Phase 0 | 1 스캐폴딩 · 2a 스키마 · 2b 인증 · 2c 계정발급 · 2d 기업관리 | ✅ |
| 핵심 루프 | 7 뉴스수집 · 8 분석 · 9 검증 · 10 엑셀리포트 | ✅ |
| Phase A | 4 국세청 · 5 DART · 5b 나라장터 | ✅ |
| UI | **분석 실행 화면 없음** (`/analysis`·`/reports` 링크만 있고 페이지 미구현) | ⬜ |
| 사이드카 | 3 스캐폴딩 · 6 dartlab · 15 딥리서치 | ⬜ |
| Phase B | 11 리스크 · 12 벤치마킹 · 13 XAI · 14 이력 | ⬜ |
| 마무리 | 16 배포 · 이메일 발송(보류) | ⬜ |

**지금 가장 큰 공백은 분석 실행 UI 다.** API 는 다 있으나 화면이 없어 관리자가 curl 없이 전체 흐름을 돌릴 수 없다. 화면이 붙어야 실제 데이터가 쌓이고 그게 Phase B(랭킹·XAI)의 입력이 된다.

### 구현된 라우트

| 경로 | 용도 |
|---|---|
| `POST /api/analyze` | **핵심 루프 전체.** 수집 → 분석 → 검증을 SSE 로 스트리밍 |
| `GET /api/news` | 뉴스 수집만 단독 실행 |
| `GET·POST /api/companies`, `PATCH·DELETE /api/companies/[id]` | 기업 CRUD (일괄 등록 포함) |
| `POST /api/companies/[id]/dart` | DART → 사업자번호 → 국세청·나라장터 일괄 보강 |
| `GET /api/reports/[runId]` | 엑셀 리포트 다운로드 |
| `/login`, `/companies`, `/` | 구현된 화면 |

## 3. 명령어

```bash
./scripts/dev.sh       # 환경 점검 + 마이그레이션 + 관리자 계정 확인 + 개발 서버 (권장)
npm run dev            # Turbopack 개발 서버만
npm run build          # 프로덕션 빌드 (타입 체크 포함)
npm run lint           # ESLint flat config — next lint 는 v16에서 제거됨
npm test               # vitest run (1회 실행)

npx vitest run src/lib/services/verification.test.ts   # 단일 파일
npx vitest run -t "never verifies when the judge"      # 테스트명 필터
npx next typegen                                       # PageProps/RouteContext 재생성

npm run db:migrate     # prisma migrate dev && prisma generate  ← 반드시 함께
npm run db:migrate:test                                # 테스트 DB 에 적용
ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts <email>   # 계정 발급

node scripts/news_pipeline_spike.mjs [기업명…]         # 수집 파이프라인 실측 재현
uv run --python 3.12 --with requests --with python-dotenv scripts/api_smoke_test.py  # 외부 API 회귀
```

테스트는 `src/**/*.test.{ts,tsx}` 만 수집한다(`vitest.config.mts`). jsdom + Testing Library.

**`fileParallelism: false` 다.** DB 테스트 파일이 병렬로 돌면 서로의 행을 지워 FK 위반이 난다. DB 를 쓰는 테스트는 `resetDatabase()`(`src/lib/test-support/db.ts`)를 `beforeEach` 에 건다 — 삭제 순서가 FK 를 따른다.

## 4. 아키텍처

```
[브라우저] ──→ [Next.js 16 풀스택]
                  proxy.ts 라우트 보호 · Route Handlers · SSE
                       │
                       ├── Prisma ──→ SQLite (개발) → PostgreSQL (운영 예정)
                       │
                       ├── HTTPS ──→ 네이버 API HUB · 구글 뉴스 RSS · 언론사 사이트(본문 크롤링)
                       │             OpenDART · 국세청 · 나라장터
                       ├── HTTPS ──→ Anthropic (분석 + 검증 judge)
                       └── HTTP ───→ [Python 사이드카 (미구현)] gpt-researcher · dartlab
```

**사이드카는 선택적 계층이다.** 죽어도 메인 기능은 폴백으로 동작해야 한다. 그래서 개발 순서도 사이드카를 뒤로 뒀다 — 핵심 루프가 사이드카 없이 완주하도록.

### 핵심 루프 데이터 흐름

```
newsCollector.collectNews(기업명)
  ├ fetchNaver   API HUB, sort=sim, "정확검색", display=100 페이징
  ├ fetchGoogle  RSS
  ├ removeDuplicates        textSimilarity.diceSimilarity (bigram Dice)
  ├ classifyRelevance       primary / mention / unrelated
  └ enrichWithBodies        articleBody: 구글링크 복원 → Readability 본문
        ↓ NewsItem[]
analyzer.analyzeCompany(기업명, news, {llm})     AsyncGenerator<AnalyzeEvent>
  뉴스별 trend·award·investment 3회 + 종합의견 1회
  is_about_company 로 감성 집계 대상을 가른다
        ↓ AnalysisResult                → repositories/analysisRun.completeRun
verification.verifyAnalysis(result, {llm})
  층① checkSources     링크 http 여부 → sourceCoverage      LLM 없음
  층② judge            주장별 supported → faithfulness      LLM
  층③ evidenceMatch    요약 vs 원문 어휘 겹침                LLM 없음
  층④ counterEvidence  "틀릴 수 있는 이유"                   층② 프롬프트에 포함
  decide() = 세 게이트의 논리곱
        ↓ VerificationOutput            → repositories/verificationResult.saveVerification
reportExcel.buildReport()  종합 분석 결과 · 뉴스별 분석 결과 · 다차원 검증
```

**디렉터리 규약**: `src/lib/services`(외부 API·도메인 로직) · `src/lib/repositories`(DB 접근) · `src/components/ui`(shadcn) · `src/components/layout`. **Route Handler 는 얇게 유지하고 로직은 services 에 둔다.**

Next.js 는 저장소 루트, 사이드카는 `sidecar/` 하위, 스크립트는 `scripts/`. **루트에 Python 파일을 두지 않는다.** 새 최상위 디렉터리를 만들면 `tsconfig` `exclude` 와 `eslint.config.mjs` `globalIgnores` 를 함께 갱신한다 — 경계가 샌 전례가 있다.

### DB 모델

`User` · `Company` · `Archive` · `AnalysisRun` · `VerificationResult` · `DartCorpCode`

- **모델은 쓰는 태스크가 자기 테스트와 함께 추가한다.** `RiskAlert`·`SelectionRecord`·`FinancialSnapshot`·`ResearchJob` 은 아직 없다 — Task 11·14·6·15 가 추가한다
- `Company` 삭제는 하드 삭제가 아니라 `isActive=false` — `AnalysisRun` 이 참조하므로 지우면 이력이 끊긴다
- `VerificationResult` 의 점수 3종은 **nullable** — judge 실패를 0점과 구분해야 한다
- `AnalysisRun.status` 는 `running`/`completed`/`no_news`/`failed`. 집계 대상 0건은 `completed` 가 아니라 `no_news`
- `AnalysisRun.formulaVersion` 기본값 `v2-anthropic` — 산식이 바뀌면 연도별 추이 비교가 왜곡된다

## 5. 제품을 좌우하는 결정 (컨설팅 시 먼저 볼 것)

### 5.1 옥타코 사고 — 이 제품의 설계를 규정한 사건

레거시 운영 리포트를 역추적한 결과다. `backup/archives/media_옥타코_AI분석결과_20251112.xlsx`:

| 구분 | 건수 | 비율 |
|---|---|---|
| 제목에 "옥타코" — 실제로 옥타코가 주제 | 13 | 9% |
| 제목엔 없고 본문에만 언급 — 대표 코멘트·참여기업 나열 | 124 | 87% |
| 어디에도 언급 없음 | 6 | 4% |

옥타코의 감성 평균은 제목매치 기사 기준 **7.31** 인데, 무관 기사 130건(평균 5.62)에 희석돼 리포트 값이 **5.78** 이 됐다. SK쉴더스 해킹(−6)·다크웹 유출(−8) 같은 **타사 악재가 옥타코 점수를 깎았다.**

**원인은 비대칭이었다.** 레거시는 수상·투자 프롬프트에만 *"반드시 '{회사}' 가 직접 받은"* 가드를 뒀고 동향(감성) 프롬프트에는 두지 않았다. 그 결과 수상·투자는 286칸 중 Y 19건으로 억제됐지만 감성은 143건 전부 채점됐다.

**신규는 두 곳에서 막는다.**
1. 수집: `sort=sim` + 관련도 3등급 (`newsCollector.classifyRelevance`)
2. 분석: 동향 프롬프트의 `is_about_company` → 감성·수상·투자 집계에서 제외 (`analyzer.summarise`)

제외한 기사는 **버리지 않는다.** 리포트의 `집계 반영` 열에 `제외` 로 남긴다.

### 5.2 검증 판정 규칙 — 임의로 완화하지 말 것

```
faithfulness ≥ 0.85  AND  sourceCoverage ≥ 0.5  AND  evidenceMatch ≥ 0.4  → verified
그 외 전부 → needs_review
```

- **오류·거부·파싱 실패·타임아웃은 무조건 `needs_review`.** `try/catch` 기본값을 `verified` 로 두는 코드를 쓰지 않는다
- judge 가 claims 를 빈 배열로 주면 `0/0` 인데 **1 이 아니라 0** 으로 친다. 검증할 것이 없다는 건 통과가 아니다
- 층③은 LLM 을 쓰지 않는다. 층②만으로는 judge 자신의 오판을 걸러낼 수 없어 독립적인 기계 신호가 필요하다
- 층④ 반증은 평가위원회 자료의 **유의사항**으로 노출한다. 숨기지 않는다
- 검증은 `complete` 이벤트를 보낸 **뒤** 실행한다. judge 가 죽어도 분석 결과와 리포트는 이미 저장된 상태다

**임계값 0.85/0.5/0.4 는 초기값이고 아직 튜닝되지 않았다.** 실측 1건(넷록스 3건)에서 층② 0.8·층③ 0.300 으로 `needs_review` 가 나왔다. 10건 이상 쌓인 뒤 verified 비율을 보고 판단한다.

**알려진 구조적 편향**: 종합의견에는 "평균 감성 4.67" 같은 AI 파생 수치가 들어가는데 기사 원문에 없으므로 judge 가 항상 `supported: false` 로 본다. 이를 버그로 보고 분모에서 빼지 않았다 — 그 수치가 AI 산출물이라는 사실은 위원회가 알아야 하고, `needs_review` 는 사람이 확인하라는 뜻이기 때문이다. **임계값을 조정하려면 이 구조를 먼저 고려할 것.**

### 5.3 조회 실패 ≠ 부적격

국세청 `isActive` 는 `boolean | null` 이다. 조회 실패·미등록은 **폐업이 아니라 미확인**(`checked: false`)이다. 실패를 부적격으로 읽으면 기업이 부당하게 탈락한다. 검증의 "실패 = 신뢰 불가" 와 같은 계열의 원칙이다.

### 5.4 재무 결측이 주 경로다

검증 대상 5개사 중 4개사는 DART 고유번호조차 없다. 올림플래닛은 공시는 있으나 `fnlttSinglAcnt`(상장사 대상)로는 재무가 나오지 않는다(`013`). **벤치마킹의 "결측 지표 제외 정규화" 는 예외 처리가 아니라 기본 동작이다.**

나라장터는 DART 에 재무가 없어도 잡힌다 — 올림플래닛 종업원 75명, 삼성전자 121,927명. Task 12 의 결측 보완 지표로 쓸 수 있다.

### 5.5 LLM 은 Anthropic 단일

- 모델 ID 는 `src/lib/services/llm.ts` 의 `resolveModel()` **한 곳**. 기본 `claude-sonnet-5`, `ANTHROPIC_MODEL` 로 변경
- **`temperature`·`top_p` 를 보내지 않는다.** Sonnet 5 가 400 으로 거부한다. 결정성은 `output_config.effort` 로 조절 (judge 는 `low`)
- `thinking: {type: "adaptive"}`, 시스템 프롬프트에 `cache_control`
- **Anthropic 은 임베딩 엔드포인트가 없다** (실측: `POST /v1/embeddings` → 404). Task 15 의 gpt-researcher 임베딩은 로컬 임베딩 / Voyage AI / 임베딩 없는 report 모드 중에서 정해야 한다 — **미결**
- 레거시 프롬프트는 gpt-4o-mini 기준으로 튜닝된 자산이다. **문구를 임의로 개선하지 않는다** — 바꾸면 분석 결과가 달라지고 연도별 추이 비교가 왜곡된다. 문구 그대로 `src/lib/services/prompts/legacy.ts` 에 옮겼고, 추가한 것은 `is_about_company` 판정뿐이다

## 6. 실측 데이터 (재검증 없이 뒤집지 말 것)

### 뉴스 수집 정밀도 — 상위 30건 중 제목에 회사명이 있는 비율

| 기업 | `sort=date` | `sort=sim` |
|---|---|---|
| 크립토랩 | 17/30 | **25/30** |
| 올림플래닛 | 14/30 | **29/30** |
| 페어리 | **1/30** | 15/30 |
| 넷록스 | 4/26 | 4/26 |
| 논스랩 | 0/30 | 0/30 |

"페어리" 처럼 일반명사와 겹치는 상호는 `date` 정렬에서 게임 기사로 뒤덮인다. **분석 대상을 상위 N건으로 자르는 구조에서는 정렬 기준이 곧 분석 품질이다.**

### 본문 관련도 판별 (본문 크롤링 후)

| 기업 | 제목매치 기사 | 본문에만 있는 기사 |
|---|---|---|
| 넷록스 | 평균 8.5회 언급, 첫등장 11% 지점 | 평균 **1.1회**, 43% 지점 (21건 중 18건이 1회) |
| 페어리 | 평균 4.6회 | 평균 **1.5회** (16건 중 11건이 1회) |

**언급 1회는 거의 예외 없이 스쳐 지나가는 언급이다.** 다만 참여기업 나열도 실제 실적이라 `mention` 등급을 버리지 않고 감성 집계에서만 뺀다.

한국어는 단어 경계가 없어 부분 문자열 오탐이 난다 — "페어리" 가 식물 기사에 7회 나왔는데 페어리링(균사체)이었다. 그래서 LLM 의 `is_about_company` 2차 판정이 필요하다.

### 그 외 실측

| 항목 | 결과 |
|---|---|
| 본문 추출 (`@mozilla/readability`) | 110건 중 107건 성공(97.3%). charset utf-8 107 / euc-kr 1 |
| 구글 뉴스 링크 복원 (batchexecute) | 7/7 성공. base64 폴백은 한 번도 안 쓰임(2024년 이후 토큰) |
| DART corp code 캐시 | **118,804건, 10.8초** (24h TTL) |
| DART 재무 | 삼성전자 매출 300.9조 ✓ / 올림플래닛 `013` ✗ / 크립토랩·넷록스 미등록 |
| 국세청 | 삼성전자·올림플래닛 모두 계속사업자 · 부가가치세 일반과세자 |
| 나라장터 | 삼성전자 121,927명 / 올림플래닛 75명 |
| Anthropic 분석 | 넷록스 3건에 in 19,132 / out 3,226 토큰 |

## 7. 개발 규약

### 플랜 주도

플랜은 두 층이다. **마스터 로드맵** `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` 가 결정·순서·리스크의 원천이고, **실행 플랜** `docs/superpowers/plans/2026-08-26-phase0-core-loop.md` 가 태스크의 파일·인터페이스·테스트를 담는다. 코드를 쓰기 전에 둘 다 읽는다. 완료된 태스크에는 실측 결과와 함정이 기록돼 있다.

### TDD

각 태스크는 **실패 테스트 → 실패 확인 → 최소 구현 → 통과** 순서다. 커밋 훅이 `npm test` + `npm run lint` 를 강제한다.

**주입 가능하게 만든 의존성은 최소 한 번은 실제 구현으로 테스트한다.** DART `corpCode.xml` 이 ZIP 인데 `node:zlib` 로 풀려던 버그를, `unzip` 을 항상 mock 으로 대체한 탓에 테스트가 못 잡고 실 API 호출에서야 드러났다.

외부 API·LLM 테스트는 전부 mock — 네트워크 의존 테스트 금지. 다만 태스크 완료 시 실 API 로 한 번 확인하고 결과를 플랜에 기록한다.

### 주석

**함수 설명 JSDoc 만 쓴다.** 본문 3줄 이내. 줄 주석(`//`)으로 코드 흐름을 설명하지 않는다 — 이름과 구조로 대신한다.

```ts
/**
 * 무엇을 하는 함수인지 한 줄.
 * 왜 이렇게 하는지 또는 호출자가 알아야 할 제약 (필요할 때만).
 */
```

둘째 줄은 판단이 필요한 곳에만. 시그니처를 한국어로 옮겨 적는 주석은 쓰지 않는다. 훅이 줄 주석과 4줄 이상 JSDoc 을 경고한다.

### 커밋

태스크 단위. 메시지는 무엇을 왜 바꿨는지 산문으로 쓰고, 실측으로 확인한 사실을 담는다.

## 8. Next.js 16 함정

설치본은 **16.3.3** 이다. **v15 기준 예제를 복사하면 깨진다.** 상세는 `node_modules/next/dist/docs/`.

- `cookies`·`headers`·`params`·`searchParams` 는 **Promise** — 동기 접근 호환은 제거됐다
- 미들웨어는 `src/proxy.ts` + `export function proxy()` — nodejs 런타임 고정. Auth.js 공식 middleware 예제가 그대로 동작하지 않는다
- Turbopack 기본 — webpack 커스텀 설정 금지
- `images.domains` deprecated → `remotePatterns`

### 그 밖에 실제로 부딪힌 함정

| 항목 | 내용 |
|---|---|
| `prisma migrate dev` | **클라이언트를 재생성하지 않는다.** `npm run db:migrate` 가 `generate` 를 체인한다. 놓치면 새 모델이 `undefined` |
| Prisma 어댑터 클래스 | `PrismaBetterSqlite3` — `SQLite3` 가 아니다 |
| next-auth v5 + vitest | `@/auth` 를 import 하면 `next/server` 해석 실패로 죽는다. 테스트 대상은 next-auth 를 물지 않는 모듈로 분리한다 (`routeAccess.ts`·`authenticate.ts`·`sessionClaims.ts` 가 그래서 분리됐다) |
| next-auth JWT 세션 | **id 를 세션에 싣지 않는다.** `jwt`·`session` 콜백으로 날라야 한다 |
| `promisify(crypto.scrypt)` | options 오버로드를 잃는다. 명시 타입 캐스트 필요 |
| zod v4 | `z.string().email()` deprecated → `z.email()` |
| CSS `@import` | Tailwind 확장 뒤로 밀려 dev 서버가 500. 웹폰트는 `layout.tsx` head 의 `<link>` 로 |
| vitest 픽스처 | `readFileSync(new URL(..., import.meta.url))` 는 죽는다. vite `?raw` import + `src/vite-raw.d.ts` |
| `scripts/*.ts` | **top-level await 불가.** `type: module` 이 없어 tsx 가 CJS 로 트랜스파일한다. `async function main()` 으로 감싼다 |

## 9. 디자인

**Montage(Wanted Design System)의 디자인 언어만 차용한다.** 구현은 shadcn/ui + Tailwind v4 그대로다.

- 런타임은 쓸 수 없다 — `@wanteddev/wds` 는 GitHub Packages 사설 레지스트리에 있고, MCP 서버(`montage.wanted.co.kr/mcp`)는 구글 OAuth 에 `hd=wantedlab.com` 이 걸려 **사내 계정 전용**이다. 저장소만 MIT 공개
- 색·간격 토큰은 `packages/wds-theme`(MIT) 값을 `src/app/globals.css` 의 CSS 변수로 옮겼다. primary `#0066FF`, label `#171719`, line `#E1E2E4`
- 상태 색은 이 제품의 의미에 묶는다 — `verified` · `review` · `risk`. 장식으로 쓰지 않는다
- 본문 폰트 Pretendard(CDN). 숫자 열은 `tabular-nums` — 사업자번호·점수가 세로로 정렬돼야 스캔이 된다
- **시그니처: 대조 가능성 표시.** 사업자번호가 없는 기업은 국세청·DART 와 대조할 수 없어 뉴스 외 근거가 없다. 빈칸이 아니라 경고로 다룬다

## 10. OSS 차용 원칙

`dartlab`(Apache-2.0)만 의존성으로 직접 채용한다. **라이선스가 없는 저장소의 코드는 한 줄도 복사하지 않는다** — 아이디어만 참고해 자체 구현한다.

레거시(`backup/`)는 통째로 재사용하지 않는다. 판단 기준은 **"로직이냐 자산이냐"** 다 — 프롬프트·언론사 매핑·엑셀 시트 구성은 복사, 나머지는 참조 후 재작성. 상세는 `legacy-migration` 스킬.

## 11. 미결 사항

| 항목 | 내용 |
|---|---|
| **Task 15 임베딩** | Anthropic 은 임베딩이 없다(404 실측). 로컬 임베딩 / Voyage AI / report 모드만 지원 중 택일 필요 |
| **이메일 발송** | Task 10 범위였으나 외부 발송이라 구현 보류. 현재는 다운로드만 |
| **검증 임계값** | 0.85/0.5/0.4 는 초기값. 실행 10건 이상 뒤 재검토 |
| **테스트 안 된 Route Handler** | vitest 에서 `auth()` 를 import 할 수 없어 라우트 핸들러에 테스트가 없다. 로직은 services·repositories 에 있고 테스트됐으며, 라우트는 dev 서버 E2E 로만 확인했다 |
| **레거시 키 폐기** | `backup/app/news_service.py:14~15` 에 네이버 개발자센터 키가 하드코딩돼 있고 커밋 이력(`1457554`)에 남아 있다 |
| **PostgreSQL 전환** | 현재 SQLite. 운영 전환 시점 미정 |

## 12. 이 파일 밖의 지식

- **작업별 상세는 `.claude/skills/`** 에 있고 해당 작업을 시작할 때 자동 로드된다 — `external-apis`(엔드포인트·인증·에러코드 실측), `legacy-migration`(backup/ 이관 규약), `sidecar-runtime`(파이썬 사이드카), `verification-pipeline`(환각 검증)
- **기계적으로 판정 가능한 규칙은 `.claude/settings.json` 의 훅**이 강제한다 — 루트 Python 파일 차단, `middleware.ts` 차단, data.go.kr 키 URL 삽입 차단, 커밋 전 test+lint 게이트, 주석 규약 경고. 훅은 `jq` 부재 시 fail-closed 이고 `src/hooks.test.ts` 가 이를 단정한다
- **과거 사고 이력은 `docs/incidents.md`** 에 있다. 형식은 증상/원인/발견/재발방지 네 줄이고, 재발 방지에 훅이나 스킬 링크가 없으면 아직 박제되지 않은 것이다

**규칙은 같은 실수가 두 번 발생했을 때만 추가한다** — 한 번은 노이즈, 두 번이 패턴이다.
