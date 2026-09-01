# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` is generated and re-written by `next dev`. Never put project knowledge there — it will be overwritten.

## 프로젝트

**성과돋보기** — 뉴스와 공공·금융 데이터를 AI로 분석해 우수기업 50개사 선정 근거를 만들고, 평가위원회에 다차원 분석자료를 제공한다. 핵심 요구사항은 **AI 환각 방지**로, 분석 결과를 공식 출처와 대조해 자동 검증하는 것이 제품의 존재 이유다.

기존 Flask 앱을 **Next.js 풀스택**으로 재구축하는 중이다. **관리자 전용 도구다** — 공개 회원가입을 열지 않고 계정은 `npx tsx scripts/create-admin.ts` 로 발급한다. 자율 가입은 향후 확장 사항이다. 레거시 데이터는 이관하지 않고 신규 시스템으로 새로 만든다. Phase 0 은 Task 1·2a·2b·2c·2d 까지 완료됐고 **핵심 루프(7 수집 → 8 분석 → 9 검증 → 10 리포트)가 완료됐다.** Phase A(4 국세청·5 DART·5b 나라장터)도 완료됐고, Task 5 잔여(동명 충돌 후보 선택·사업자번호 입력)는 기업 상세 "확인 필요" 블록으로 완료됐다. 분석 실행 UI(일괄 실행 화면 `/companies` + 배치 스크립트)와 사건 모니터링(대시보드·기업 카드·월간 문서)은 완료됐다. Phase B 도 완료됐다(12 벤치마킹 랭킹·13 기여도/인용·14 이력/시상, 11 은 사건 모니터링이 대체). 배포(16)는 웹 컨테이너까지 만들었고(`deploy/`) 이미지 빌드 검증과 PostgreSQL 전환이 남았다. Task 6(재무 비율)은 dartlab 없이 자체 계산으로 닫았고 **딥리서치(15·15b)는 폐기했다.** 남은 것은 배포 잔여(이미지 빌드 검증·PostgreSQL 전환)다.

## 플랜 주도 개발

플랜은 두 층이다. **마스터 로드맵** `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` 가 결정·순서·리스크의 원천이고, **실행 플랜** `docs/superpowers/plans/2026-08-26-phase0-core-loop.md` 가 진행 중인 태스크의 파일·인터페이스·테스트를 담는다. 코드를 쓰기 전에 둘 다 읽는다.

- 태스크 단위 커밋 — 메시지는 플랜에 명시돼 있다
- 각 태스크는 **실패 테스트 → 구현 → 통과** 순서
- **주석은 함수 설명 JSDoc 만 쓴다** — 아래 템플릿, 본문 3줄 이내. 줄 주석(`//`)으로 코드 흐름을 설명하지 않는다. 그건 이름과 구조로 대신한다

  ```ts
  /**
   * 무엇을 하는 함수인지 한 줄.
   * 왜 이렇게 하는지 또는 호출자가 알아야 할 제약 (필요할 때만).
   */
  ```

  판단이 필요한 곳에만 둘째 줄을 쓴다. 시그니처를 한국어로 옮겨 적는 주석은 쓰지 않는다
- 외부 API 테스트는 전부 mock — 네트워크 의존 테스트 금지

## 명령어

```bash
./scripts/dev.sh       # 환경 점검 + 마이그레이션 + 개발 서버 (권장)
npm run dev            # Turbopack 개발 서버만
npm run build          # 프로덕션 빌드 (타입 체크 포함)
npm run lint           # ESLint flat config — next lint 는 v16에서 제거됨
npm test               # vitest run (1회 실행)

npx vitest run src/components/ui/button.test.tsx    # 단일 파일
npx vitest run -t "renders its label"               # 테스트명 필터
npx next typegen                                    # PageProps/RouteContext 재생성
```

테스트는 `src/**/*.test.{ts,tsx}` 만 수집한다(`vitest.config.mts`). jsdom + Testing Library.

## 아키텍처

```
[Next.js 풀스택] ── Prisma ──→ [SQLite → PostgreSQL]
   화면 · Route Handlers · SSE 진행률
   뉴스수집 · GPT분석 · 검증 · 벤치마킹 · 엑셀 리포트
        │
        └─HTTPS→ 국세청 · OpenDART · 나라장터 · 네이버 뉴스
```

**전부 Next.js 안에서 돈다.** Python 사이드카는 2026-09-01 에 걷어냈다 — 맡기려던 둘(딥리서치·dartlab 정규화)이
모두 사라져 소비자가 없는 계층이 됐다. 파이썬 전용 라이브러리가 다시 필요해지면 `git log -S "FastAPI"` 로 되짚는다.

디렉터리: `src/components/ui`(shadcn) · `src/components/layout` · `src/lib/services`(외부 API·도메인 로직) · `src/lib/repositories`(DB 접근). **Route Handler 는 얇게 유지하고 로직은 services 에 둔다.**

Next.js 는 저장소 루트, 스크립트는 `scripts/`. **Python 파일은 `scripts/` 아래에만 둔다.** 새 최상위 디렉터리를 만들면 `tsconfig` `exclude` 와 `eslint.config.mjs` `globalIgnores` 를 함께 갱신한다 — 경계가 샌 전례가 있다.

## 외부 API

### 사용 중 (구현 완료)

| API | 용도 | 엔드포인트 | 구현 |
|---|---|---|---|
| 네이버 뉴스 검색 (API HUB) | 주 수집원 | `naverapihub.apigw.ntruss.com/search/v1/news` | `newsCollector.ts` |
| 구글 뉴스 RSS | 보조 수집원 | `news.google.com/rss/search` | `newsCollector.ts` |
| 구글 뉴스 batchexecute | RSS 링크 → 원문 URL 복원 | `news.google.com/_/DotsSplashUi/data/batchexecute` | `articleBody.ts` |
| OpenDART 고유번호 | 기업명 → corp_code (20MB zip, 24h 캐시) | `opendart.fss.or.kr/api/corpCode.xml` | `dartCorpCode.ts` |
| OpenDART 기업개황 | **사업자번호 확보**·대표·업종 | `opendart.fss.or.kr/api/company.json` | `dart.ts` |
| OpenDART 재무 | 매출·영업이익·순이익·자산총계 | `opendart.fss.or.kr/api/fnlttSinglAcnt.json` | `dart.ts` |
| 국세청 휴폐업 | 계속사업자·과세유형 | `api.odcloud.kr/api/nts-businessman/v1/status` | `nts.ts` |
| 나라장터 조달업체 | 종업원수·조달업무구분·개업일 | `apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02` | `narajangteo.ts` |
| 나라장터 낙찰 | 공공조달 매출 실적 (재무 결측 대리지표) | `apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttus{Thng,Servc}PPSSrch` | `procurementWins.ts` |
| Anthropic Messages | 분석·검증 judge·반증 (기본) | `api.anthropic.com/v1/messages` (SDK) | `llm.ts` |
| OpenAI Chat Completions | 같은 역할의 대체 공급자 | `api.openai.com/v1/chat/completions` (SDK) | `llmOpenai.ts` |
| SGIS 행정구역 | 시도·시군구 이름표 (지역 표기 정규화) | `sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson` | `scripts/fetch-regions.ts` |
| 네이버 Maps | 주소 → 좌표(지오코딩) · 지도 표시 | `maps.apigw.ntruss.com/map-geocode/v2/geocode` · `oapi.map.naver.com/openapi/v3/maps.js` | `naverGeocode.ts` · `naver-map.tsx` |

### 확장 예정 — 재무 결측 보완 (활용신청 완료·구현 대기)

비상장·비외감 기업은 재무제표가 공개되지 않는다. **재무제표 대체가 아니라 대리지표로 메운다.**

| API | 용도 | 상태 | 엔드포인트 / 신청 URL |
|---|---|---|---|
| 조달청_나라장터 **계약**정보 | 계약 규모·거래 지속성 | ✅ 개통 | `apis.data.go.kr/1230000/**ao**/CntrctInfoService/getCntrctInfoListThngPPSSrch` |
| 금융위원회_기업기본정보 | **DART 미등록 기업의 사업자번호**·설립일·종업원수 | ✅ 개통 | `apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2` |
| 중소벤처기업부_벤처기업명단 | 벤처확인 여부·유형·유효기간 | ✅ 개통 | `api.odcloud.kr/api/15084581/v1/uddi:47b202c9-f0bb-43b4-949c-ebe9ef56ef02` |
| 국민연금공단_가입 사업장 내역 | 고용 규모·추이·인건비 | ✅ 개통 | `apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2` (V2, 2025-05-07~) |

- **네이버 지도는 계정 키가 아니라 Application 키다.** 뉴스용 `NCP_APIGW_API_KEY*` 로 Maps 를 부르면 `errorCode 210 Permission Denied` 다 — 콘솔에서 Maps Application 을 따로 만들어 `NEXT_PUBLIC_NCP_MAP_CLIENT_ID`/`NCP_MAP_CLIENT_SECRET` 를 받아야 하고, Web 서비스 URL 등록이 없으면 스크립트가 인증에서 막힌다
- 지도 v3 스크립트 파라미터는 `ncpKeyId` 다 — 블로그에 널린 `ncpClientId` 예제는 인증에서 실패한다
- **핀 정밀도를 색·선으로 구분한다.** 국민연금 주소는 번지가 없어 도로 대표점(50개사 중 46)이다. 건물 단위와 같은 점으로 그리면 없는 정밀도를 믿게 된다
- **SGIS 는 통계청에서 국가데이터처로 옮겼다** — `sgisapi.kostat.go.kr` 은 `sgisapi.mods.go.kr` 로 302 된다. 인증키도 별도다(`SGIS_CONSUMER_KEY`/`SECRET`, `consumer_key`→`accessToken` 2단계)
- **지역 지도는 지형이 아니라 타일 그리드다.** 50개사 중 21개가 서울이라 지형 지도에서는 수도권이 한 점으로 뭉친다. 면적을 버리고 시도 17칸을 고르게 두면 값끼리 비교가 된다 — `region-grid.tsx`
- **시도 표기는 SGIS 이름표에 맞춰 옮긴다.** 원천은 `전북특별자치도`·`전남광주통합특별시` 로 오고 SGIS 2023 은 `전라북도`·`광주광역시`+`전라남도` 다. 통합 시도는 시군구로 갈라내고(`북구`→광주, `나주시`→전남), 옮길 수 없으면 추측하지 않고 미대응으로 남긴다
- **인증키는 계정당 하나다.** `NTS_SERVICE_KEY`(Decoding)를 그대로 쓰고 API 별 활용신청만 추가한다
- **나라장터는 서비스마다 경로 접두사가 다르다** — 낙찰은 `as/`, 계약은 `ao/`, 조달업체는 `ao/`. 틀리면 `NO_OPENAPI_SERVICE_ERROR`(12)
- 나라장터 낙찰·계약은 **업체 단위 조회 파라미터가 없다.** 기간으로 전수 스캔한 뒤 `bidwinnrBizno`·`bidwinnrNm` 으로 걸러야 한다 — 배치 수집 전제(`scripts/collect-procurement.ts`)
- **조달청은 연속 요청에 `정상` 헤더와 빈 배열을 돌려준다.** 행 수가 줄었다고 마지막 페이지로 읽으면 스캔이 조용히 멈춘다 — 종료는 응답의 `totalCount` 로 판정하고, 남았다는데 0행이면 실패로 본다
- **국민연금은 사업자등록번호를 앞 6자리만 준다**(`625870****`). 기업 식별은 상호·주소·업종·사업장등록일 4중 대조로 하고, 10자리를 요구하는 국세청·나라장터는 여기서 열리지 않는다
- 국민연금은 **사업장 단위**다. 본사 이전·지점은 별개 행으로 잡히므로 사업자번호 앞 6자리로 법인 단위 합산해야 한다 — 합치지 않으면 이전을 인원 급감으로 오독한다
- 국민연금은 **제공 시점 기준 12개월치만 유지**하고 매년 삭제한다. 연 단위 추이가 필요하면 매월 15일 이후 스냅샷을 DB 에 적재해 직접 쌓아야 한다
- **동명 타사 오답은 금융위만의 문제가 아니다.** 상호 검색을 쓰는 원천은 전부 그렇다 — 확정은 항상 두 원천 이상의 교차 일치로 한다 (옥타코·페어리 사례)
- 수집 스크립트는 `scripts/collect-financial-signals.ts` — 결과는 `data/`(gitignore). 실측 결과는 `docs/2026-08-28-financial-signals.md`, 커버리지 현황은 `docs/dashboard-preview.html`
- 금융위 **기업재무정보**(`15043459`)는 채택하지 않았다 — 원천이 전자공시라 DART 와 같은 결측이 난다

신규 API 를 붙이면 `scripts/api_smoke_test.py` 에 검사 함수를 함께 추가한다.


## LLM 공급자

**기본은 Anthropic이고 `LLM_PROVIDER=openai` 로 OpenAI 로 갈아탄다.** 두 어댑터가 같은 `LlmClient`
(`json<T>(request) → {data, usage}`)를 내므로 분석·검증 호출부는 어느 쪽인지 알지 못한다.

| | Anthropic | OpenAI |
|---|---|---|
| 어댑터 | `llm.ts` `createLlmClient` | `llmOpenai.ts` `createOpenAiClient` |
| 기본 모델 | `claude-sonnet-5` | `gpt-5.6-terra` |
| 모델 환경변수 | `ANTHROPIC_MODEL` | `OPENAI_MODEL` |
| 스키마 강제 | 프롬프트 + `extractJson` → zod | `response_format: json_schema` → zod |
| 캐시 | `cache_control: ephemeral` 명시 | 접두 일치 자동 |
| effort | `output_config.effort` | `reasoning_effort` |

- **모르는 `LLM_PROVIDER` 는 던진다.** 조용히 기본으로 떨어뜨리면 오타가 공급자를 바꿔 놓고 청구서로 알게 된다
- **다른 공급자의 모델 변수는 읽지 않는다** — 남은 `ANTHROPIC_MODEL` 이 OpenAI 실행 기록에 적히면 기록이 거짓이 된다
- OpenAI 는 `strict: false` 로 보낸다. strict 는 선택 필드를 전부 required 로 요구해 기존 스키마가 깨진다 — 검증은 zod 가 한 번 더 한다
- 모델 선택(2026-09-01 공식 가격, 입력/출력 per 1M): `gpt-5.6-terra` $2/$12 가 기본이다. 이 제품은 환각 검증이 존재 이유라 judge 를 최저가 칸에 두지 않는다. 대량 기사 분류만 싸게 돌리려면 `gpt-5.4-mini` $0.75/$4.50, 그 아래 `gpt-5-nano` $0.05/$0.40 는 judge 용으로 부적절하다

## Next.js 16 함정

설치본은 16.3.3 이다. **v15 기준 예제를 복사하면 깨진다.** 상세는 `node_modules/next/dist/docs/` 를 볼 것.

- `cookies`·`headers`·`params`·`searchParams` 는 **Promise** — 동기 접근 호환은 제거됐다
- 미들웨어는 `proxy.ts` + `export function proxy()` — nodejs 런타임 고정. Auth.js 공식 middleware 예제가 그대로 동작하지 않는다
- Turbopack 기본 — webpack 커스텀 설정 금지
- `images.domains` deprecated → `remotePatterns`

## 디자인

**방향 B「신호(Signal)」** — `docs/superpowers/specs/2026-08-30-visual-redesign-design.md` 가 원천이다. 구현은 shadcn/ui + Tailwind v4 그대로다. Montage 토큰과 코믹북 층(크림지·잉크 2px·하드 그림자·Anton 리본)은 걷어냈다 — 다시 들이지 않는다.

- 토큰은 `src/app/globals.css` 세 곳(`:root` · `.dark` · `@theme inline`)에 있다. band `#0B1220`(헤더 밴드) · ink/foreground `#0B1220` · hairline `#E3E5EA` · primary `#2B6BFF` 하나. 다크는 밴드를 배경보다 한 단계 더 어둡게 둔다. **기본은 라이트고, 헤더의 토글로 전환한다** — 선택은 `localStorage.theme` 에 남고 `layout.tsx` 인라인 스크립트가 첫 페인트 전에 적용한다. 운영체제 설정(`prefers-color-scheme`)은 따르지 않는다
- 서체는 Pretendard 본문 + **Gothic A1 900** 디스플레이(`font-display` — H1·절 번호·절 제목·리본). Gothic A1 은 `next/font/google` 로 self-host 한다(`--font-gothic-a1`)
- 절은 상자가 아니라 **4px 상단 괘선 + 큰 번호**(`Panel`·`SectionHead`)로 나뉜다. 배지·버튼·카드는 `signal`/`signal-outline` 변형 — 사각, 그림자 없음
- 워드마크는 `src/components/layout/wordmark.tsx` 하나로 헤더·로그인에 쓴다. 브랜드색은 currentColor·primary 만
- 상태 색은 이 제품의 의미에 묶는다 — `verified`(검증 통과) · `review`(검토 필요) · `risk`(리스크) · `pending`(미분석). 장식·리본·브랜드에 쓰지 않는다
- 숫자 열은 `tabular-nums` — 사업자번호·점수가 세로로 정렬돼야 스캔이 된다
- **시그니처: 대조 가능성 표시.** 사업자번호가 없는 기업은 국세청·DART 와 대조할 수 없어 뉴스 외 근거가 없다. 빈칸이 아니라 경고(review 톤)로 다룬다

## OSS 차용 원칙

**현재 직접 채용한 OSS 의존성은 없다.** 후보였던 `dartlab`(Apache-2.0)은 2026-09-01 에 채택하지 않았다 —
진입점이 `Company(stockCode)` 라 상장사만 다루고, 50개사 중 4개사(모두 이미 재무를 확보한 기업)에만 닿았다.
재무 비율은 `financeRatios.ts` 로 자체 계산한다.

**라이선스가 없는 저장소의 코드는 한 줄도 복사하지 않는다** — 아이디어만 참고해 자체 구현한다.

## 이 파일의 경계

작업별 상세는 `.claude/skills/` 에 있고 해당 작업을 시작할 때 자동으로 로드된다 — `external-apis`(외부 API 연동), `legacy-migration`(backup/ 이관), `verification-pipeline`(환각 검증).

기계적으로 판정 가능한 규칙은 `.claude/settings.json` 의 훅이 강제한다. 과거 사고 이력은 `docs/incidents.md` 에 있다.

**이 파일에는 코드를 쓸 때 매번 필요한 것만 남긴다.** 특정 작업에서만 필요하면 스킬로, 정규식·명령으로 검증되면 훅으로 보낸다. 규칙은 **같은 실수가 두 번 발생했을 때만** 추가한다 — 한 번은 노이즈, 두 번이 패턴이다.
