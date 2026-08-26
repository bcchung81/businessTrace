# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` is generated and re-written by `next dev` (`node_modules/next/dist/server/lib/generate-agent-files.js`). Never put project knowledge there — it will be overwritten. This file is the place for it.

## 프로젝트

**성과돋보기** — 뉴스와 공공·금융 데이터를 AI로 분석해 우수기업 50개사 선정 근거를 만들고, 평가위원회에 다차원 분석자료를 제공하는 시스템. 핵심 요구사항은 **AI 환각 방지**로, 분석 결과를 공식 출처(DART 재무, 국세청 휴폐업)와 대조해 자동 검증하는 것이 제품의 존재 이유다.

기존 Flask 앱을 **Next.js 풀스택 + Python 사이드카**로 재구축하는 중이다. 현재 Phase 0 Task 1(스캐폴딩)까지 완료됐고, 나머지는 아직 코드가 없다.

## 플랜 주도 개발

`docs/superpowers/plans/`가 작업의 원천이다. 코드를 쓰기 전에 현행 플랜을 읽는다.

- **현행**: `2026-08-26-nextjs-rearchitecture.md` — Task 1~16, 의존성 그래프, 리스크 대응표
- **폐기**: `2026-08-26-p0-trust-verification.md` — Flask 기준. 참고만 하고 따르지 않는다

규칙: 태스크 단위 커밋(메시지는 플랜에 명시됨), 각 태스크는 실패 테스트 → 구현 → 통과 순서, **신규 코드에 주석 금지**, 외부 API 테스트는 전부 mock(네트워크 의존 테스트 금지).

## 명령어

```bash
npm run dev            # Turbopack 개발 서버
npm run build          # 프로덕션 빌드 (타입 체크 포함)
npm run lint           # ESLint flat config — next lint 는 v16에서 제거됨
npm test               # vitest run (1회 실행)
npm run test:watch     # 감시 모드

npx vitest run src/components/ui/button.test.tsx    # 단일 파일
npx vitest run -t "renders its label"               # 테스트명으로 필터
npx next typegen                                    # PageProps/LayoutProps/RouteContext 재생성
```

테스트는 `src/**/*.test.{ts,tsx}`만 수집한다(`vitest.config.mts`). jsdom + Testing Library, `vitest.setup.ts`에서 jest-dom 매처를 로드한다.

## 아키텍처

목표 구성(플랜 기준):

```
[Next.js 풀스택] ── Prisma ──→ [SQLite → PostgreSQL]
   화면 · Route Handlers · SSE 진행률
   뉴스수집 · GPT분석 · 검증 · 벤치마킹 · 엑셀 리포트
        │
        ├─HTTP─→ [Python 사이드카 (FastAPI)]  Python 전용 라이브러리만
        │           /research  gpt-researcher 딥리서치 (비동기 잡)
        │           /finance   dartlab 재무 정규화
        └─HTTPS→ 국세청 · OpenDART · 나라장터 · 네이버/구글 뉴스 · Tavily
```

**사이드카는 선택적 계층이다.** 사이드카가 죽어도 뉴스 수집·GPT 분석·검증·리포트 같은 메인 기능은 폴백으로 동작해야 한다.

디렉터리 규약: `src/components/ui`(shadcn), `src/components/layout`, `src/lib/services`(외부 API·도메인 로직), `src/lib/repositories`(DB 접근). Route Handler는 얇게 유지하고 로직은 services에 둔다.

**Next.js는 저장소 루트, 사이드카는 `sidecar/` 하위**로 확정됐다(플랜의 "저장소 구조" 절에 근거와 전환 트리거). **루트에 Python 파일을 두지 않는다** — 전부 `sidecar/` 또는 `scripts/`. 경계가 암묵적이라 샌 전례가 있으므로(ESLint가 `backup/` 레거시 JS를 훑어 경고 21건) 새 최상위 디렉터리를 만들면 `tsconfig` `exclude`와 `eslint.config.mjs` `globalIgnores`를 함께 갱신한다.

### 사이드카 파이썬 런타임

**3.12로 핀하고 `gpt-researcher==0.15.1`로 고정한다.** 0.16.0은 `query_processing.py`에서 `Any`·`List`를 import하지 않는 업스트림 버그가 있어 3.12/3.13에서 import가 죽는다(3.14는 PEP 649 지연 평가로 가려질 뿐 코드가 정상인 게 아니다). 로컬 기본 파이썬이 3.14이므로 `uv`로 3.12를 강제해야 한다.

`scripts/sidecar_env_check.py`가 이 조합을 실제 설치·import까지 검증한다. 의존성이나 파이썬 버전을 건드리면 이 스크립트를 먼저 돌린다.

```bash
python3 scripts/sidecar_env_check.py                 # 버전별 해결 매트릭스
python3 scripts/sidecar_env_check.py --install 3.12  # 실제 설치·import 검증
```

### 검증 파이프라인

제품의 핵심이므로 임의로 단순화하지 말 것. 4층 구조 — ① 출처 인용 검사 ② LLM-as-judge 근거충실도 ③ evidence-match 어휘 겹침(LLM 호출 없음) ④ 반증 분석. 판정은 `faithfulness ≥ 0.85 AND 출처커버리지 ≥ 0.5 AND evidence-match ≥ 0.4`일 때만 verified이고, **오류·파싱 실패는 무조건 needs_review**(검증 실패 = 신뢰 불가).

## Next.js 16 함정

설치본은 16.3.3이다. v15 기준 예제를 복사하면 깨진다. 상세는 플랜의 "Next.js 16 반영 사항" 표와 `node_modules/next/dist/docs/`를 볼 것.

- `cookies`·`headers`·`params`·`searchParams`는 **Promise** — 동기 접근 호환은 제거됐다
- 미들웨어는 `proxy.ts` + `export function proxy()` — nodejs 런타임 고정, edge 미지원. Auth.js 공식 middleware 예제가 그대로 동작하지 않는다
- Turbopack 기본 — webpack 커스텀 설정 금지, 필요 시 `next.config.ts`의 `turbopack` 키
- `images.domains` deprecated → `remotePatterns`

## 레거시 Flask 앱

`backup/`에 있고 **gitignore된다**(원본 이력은 커밋 `1457554`).

**활용 방침: 통째로 재사용하지 않는다. 필요하면 참조해서 신규 작성하거나, 자산 성격의 것은 복사해서 쓴다.** 판단 기준은 "로직이냐 자산이냐"다.

| 복사해서 쓸 것 (운영에서 검증된 자산) | 참조만 하고 재작성할 것 |
|---|---|
| `domain_press_mapping.json` — 도메인→언론사 181건 | `app/routes.py` 4,642줄 — Route Handler + services로 분해 |
| `app/news_analyzer.py`의 GPT 프롬프트 문자열 | `app/static/app.js` 196KB, `style.css` 100KB |
| `app/routes.py:1520~2065`의 엑셀 시트 구성·스타일 | `app/templates/*.html` 2,334줄 — React/shadcn으로 |
| `app/email_service.py`의 발송 템플릿 | `app/news_service.py`의 수집·중복제거 휴리스틱 |

복사할 때는 그대로 옮기되 Python→TypeScript 변환과 네이밍만 현재 규약에 맞춘다. 프롬프트는 운영에서 튜닝된 것이므로 **문구를 임의로 개선하지 않는다** — 바꾸면 분석 결과가 달라진다.

**주의: `backup/`은 gitignore되므로 복사해 온 것만 살아남는다.** 이 폴더를 정리하기 전에 필요한 자산을 모두 추출했는지 확인할 것.

이관 대상 실데이터는 Flask instance 폴더 관례에 따라 **`backup/instance/news_homepage.db`**에 있다(users 10 / archives 3 / companies 42). 루트의 `backup/news_homepage.db`는 빈 파일이고 `.backup`은 오래된 스냅샷이니 쓰지 말 것.

## 외부 API 실측 사항

`scripts/api_smoke_test.py`가 실제 호출로 검증한 결과다. 재검증 전에 뒤집지 말 것.

```bash
uv run --python 3.12 --with requests --with python-dotenv scripts/api_smoke_test.py
```

- **data.go.kr 키(국세청·나라장터)는 `.env`에 Decoding 키를 넣고 항상 쿼리 파라미터로 전달한다.** 키 종류와 전달 방식은 짝이 맞아야 하며, 실측 결과는 다음과 같다.

  | 키 | 전달 방식 | 결과 |
  |---|---|---|
  | **Decoding** | **params / `searchParams.set()`** | **200** ← 이 조합을 쓴다 |
  | Decoding | URL 문자열 직접 삽입 | 401 (`+`가 공백으로 해석) |
  | Encoding | params | 401 (`%`가 이중 인코딩) |
  | Encoding | URL 문자열 직접 삽입 | 200 (동작하지만 채택하지 않음) |

  Decoding 키를 택하는 이유는 fetch·axios·requests가 파라미터를 자동 인코딩하는 기본 동작과 짝이 맞기 때문이다. Encoding 키를 저장하면 "인코딩하지 말 것"이라는 암묵적 규칙이 생겨 깨지기 쉽다
- **국세청**: `api.odcloud.kr/api/nts-businessman/v1/status`에 POST, `b_stt_cd == "01"`이 계속사업자
- **OpenDART**: 기업개황 `company.json`의 `bizr_no`로 사업자번호를 얻는다(삼성전자 1248100998, 올림플래닛 1208824298 확인). 재무는 `fnlttSinglAcnt` + `reprt_code=11011`(사업보고서)
- **재무 결측이 주 경로다.** 검증 대상 5개사 중 4개사는 DART 고유번호조차 없고, 올림플래닛은 공시는 있으나 `fnlttSinglAcnt`로는 재무제표가 안 나온다(비상장). 벤치마킹의 결측 지표 제외 정규화는 예외가 아니라 기본 동작
- **나라장터**: 엔드포인트는 아래가 정답이다. **서비스명에도 `02`가 붙는다** — 빠뜨리면 `NO_OPENAPI_SERVICE_ERROR`가 난다. `inqryDiv=3` + `bizno`로 **사업자번호 조회만** 가능하고 업체명 역검색은 없다. 인증키는 `NTS_SERVICE_KEY`를 공용으로 쓴다

  ```
  https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02
  ```

  응답에 `emplyeNum`(종업원수), `corpBsnsDivNm`(조달업무구분), `opbizDt`(개업일), `mnfctDivNm`(제조구분)이 온다. DART에 재무가 없는 비상장 기업도 여기선 잡히므로 Task 12 지표 보강에 쓸 수 있다
- **data.go.kr 에러 코드 구분**: `NO_OPENAPI_SERVICE_ERROR`는 **경로 불일치**, `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 미구독이다. 전자를 구독 문제로 오진하지 말 것

**네이버 검색 API는 NAVER API HUB로 이관됐다(2026-06~07).** developers.naver.com 애플리케이션 등록 화면의 "사용 API" 목록에 **검색·데이터랩이 없는 것이 정상**이다 — 2026-07-31에 신규 신청이 종료됐다. 설정 실수로 오진하지 말 것.

| | 개발자센터 (레거시) | API HUB (현재 사용) |
|---|---|---|
| 엔드포인트 | `openapi.naver.com/v1/search/news.json` | `naverapihub.apigw.ntruss.com/search/v1/news` |
| 헤더 | `X-Naver-Client-Id` / `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| env | `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | `NCP_APIGW_API_KEY_ID` / `NCP_APIGW_API_KEY` |
| 키 길이 | ID 20자 / Secret 10자 | ID 10자 / Secret 40자 |

**엔드포인트와 헤더는 한 쌍으로 바꿔야 한다** — HUB 키를 레거시 엔드포인트에 쓰면 `NID AUTH Result Invalid (1000)`이 난다. 응답 필드(`title`·`originallink`·`link`·`description`·`pubDate`)는 동일하므로 **파서는 공용이고 엔드포인트·헤더만 분기**한다.

키 발급은 네이버 클라우드 콘솔 → All Services > Application Services > NAVER API HUB → Application 등록. API별 개별 신청 없이 Application 하나로 검색 전체와 데이터랩을 쓴다. 무료이나 향후 유료화 예정이고 초과 시 429다. 쇼핑·책·전문자료 검색은 대체 없이 완전 종료됐다.

키는 전부 `.env`(gitignore됨): `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`, `DART_API_KEY`, `NTS_SERVICE_KEY`, `TAVILY_API_KEY`, `GMAIL_*`, `SMTP_*`.

## OSS 차용 원칙

플랜의 "OSS 채택 검증 결과"를 따른다. `dartlab`(Apache-2.0)만 의존성으로 직접 채용하고, **라이선스가 없는 저장소의 코드는 한 줄도 복사하지 않는다** — 아이디어만 참고해 자체 구현한다.
