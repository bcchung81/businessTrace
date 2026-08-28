# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` is generated and re-written by `next dev`. Never put project knowledge there — it will be overwritten.

## 프로젝트

**성과돋보기** — 뉴스와 공공·금융 데이터를 AI로 분석해 우수기업 50개사 선정 근거를 만들고, 평가위원회에 다차원 분석자료를 제공한다. 핵심 요구사항은 **AI 환각 방지**로, 분석 결과를 공식 출처와 대조해 자동 검증하는 것이 제품의 존재 이유다.

기존 Flask 앱을 **Next.js 풀스택 + Python 사이드카**로 재구축하는 중이다. **관리자 전용 도구다** — 공개 회원가입을 열지 않고 계정은 `npx tsx scripts/create-admin.ts` 로 발급한다. 자율 가입은 향후 확장 사항이다. 레거시 데이터는 이관하지 않고 신규 시스템으로 새로 만든다. Phase 0 은 Task 1·2a·2b·2c·2d 까지 완료됐고 **핵심 루프(7 수집 → 8 분석 → 9 검증 → 10 리포트)가 완료됐다.** 다음은 Phase A 잔여(4 국세청·5 DART·5b 나라장터)와 Phase B(11~14)다.

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
        ├─HTTP─→ [Python 사이드카 (FastAPI)]  Python 전용 라이브러리만
        └─HTTPS→ 국세청 · OpenDART · 나라장터 · 네이버 뉴스 · Tavily
```

**사이드카는 선택적 계층이다.** 죽어도 메인 기능은 폴백으로 동작해야 한다.

디렉터리: `src/components/ui`(shadcn) · `src/components/layout` · `src/lib/services`(외부 API·도메인 로직) · `src/lib/repositories`(DB 접근). **Route Handler 는 얇게 유지하고 로직은 services 에 둔다.**

Next.js 는 저장소 루트, 사이드카는 `sidecar/` 하위, 스크립트는 `scripts/`. **루트에 Python 파일을 두지 않는다.** 새 최상위 디렉터리를 만들면 `tsconfig` `exclude` 와 `eslint.config.mjs` `globalIgnores` 를 함께 갱신한다 — 경계가 샌 전례가 있다.

## Next.js 16 함정

설치본은 16.3.3 이다. **v15 기준 예제를 복사하면 깨진다.** 상세는 `node_modules/next/dist/docs/` 를 볼 것.

- `cookies`·`headers`·`params`·`searchParams` 는 **Promise** — 동기 접근 호환은 제거됐다
- 미들웨어는 `proxy.ts` + `export function proxy()` — nodejs 런타임 고정. Auth.js 공식 middleware 예제가 그대로 동작하지 않는다
- Turbopack 기본 — webpack 커스텀 설정 금지
- `images.domains` deprecated → `remotePatterns`

## 디자인

**Montage(Wanted Design System)의 디자인 언어만 차용한다.** 구현은 shadcn/ui + Tailwind v4 그대로다.

- 런타임은 쓸 수 없다 — `@wanteddev/wds` 는 GitHub Packages 사설 레지스트리에 있고, MCP 서버(`montage.wanted.co.kr/mcp`)는 구글 OAuth 에 `hd=wantedlab.com` 이 걸려 사내 계정 전용이다. 저장소만 MIT 공개다
- 색·간격 토큰은 `packages/wds-theme`(MIT) 값을 `src/app/globals.css` 의 CSS 변수로 옮겼다. primary `#0066FF`, label `#171719`, line `#E1E2E4`, status positive/cautionary/negative
- 상태 색은 이 제품의 의미에 묶는다 — `verified`(검증 통과) · `review`(검토 필요) · `risk`(리스크). 장식으로 쓰지 않는다
- 본문 폰트는 Pretendard(CDN, `layout.tsx` head). 숫자 열은 `tabular-nums` — 사업자번호·점수가 세로로 정렬돼야 스캔이 된다
- **시그니처: 대조 가능성 표시.** 사업자번호가 없는 기업은 국세청·DART 와 대조할 수 없어 뉴스 외 근거가 없다. 빈칸이 아니라 경고로 다룬다

## OSS 차용 원칙

`dartlab`(Apache-2.0)만 의존성으로 직접 채용한다. **라이선스가 없는 저장소의 코드는 한 줄도 복사하지 않는다** — 아이디어만 참고해 자체 구현한다.

## 이 파일의 경계

작업별 상세는 `.claude/skills/` 에 있고 해당 작업을 시작할 때 자동으로 로드된다 — `external-apis`(외부 API 연동), `legacy-migration`(backup/ 이관), `sidecar-runtime`(파이썬 사이드카), `verification-pipeline`(환각 검증).

기계적으로 판정 가능한 규칙은 `.claude/settings.json` 의 훅이 강제한다. 과거 사고 이력은 `docs/incidents.md` 에 있다.

**이 파일에는 코드를 쓸 때 매번 필요한 것만 남긴다.** 특정 작업에서만 필요하면 스킬로, 정규식·명령으로 검증되면 훅으로 보낸다. 규칙은 **같은 실수가 두 번 발생했을 때만** 추가한다 — 한 번은 노이즈, 두 번이 패턴이다.
