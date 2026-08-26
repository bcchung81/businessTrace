# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` is generated and re-written by `next dev`. Never put project knowledge there — it will be overwritten.

## 프로젝트

**성과돋보기** — 뉴스와 공공·금융 데이터를 AI로 분석해 우수기업 50개사 선정 근거를 만들고, 평가위원회에 다차원 분석자료를 제공한다. 핵심 요구사항은 **AI 환각 방지**로, 분석 결과를 공식 출처와 대조해 자동 검증하는 것이 제품의 존재 이유다.

기존 Flask 앱을 **Next.js 풀스택 + Python 사이드카**로 재구축하는 중이다. Phase 0 은 Task 1(스캐폴딩)·2a(Prisma 스키마)까지 완료됐고 다음은 2b(인증)다.

## 플랜 주도 개발

플랜은 두 층이다. **마스터 로드맵** `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` 가 결정·순서·리스크의 원천이고, **실행 플랜** `docs/superpowers/plans/2026-08-26-phase0-core-loop.md` 가 진행 중인 태스크의 파일·인터페이스·테스트를 담는다. 코드를 쓰기 전에 둘 다 읽는다.

- 태스크 단위 커밋 — 메시지는 플랜에 명시돼 있다
- 각 태스크는 **실패 테스트 → 구현 → 통과** 순서
- **신규 코드에 주석 금지**
- 외부 API 테스트는 전부 mock — 네트워크 의존 테스트 금지

## 명령어

```bash
npm run dev            # Turbopack 개발 서버
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

## OSS 차용 원칙

`dartlab`(Apache-2.0)만 의존성으로 직접 채용한다. **라이선스가 없는 저장소의 코드는 한 줄도 복사하지 않는다** — 아이디어만 참고해 자체 구현한다.

## 이 파일의 경계

작업별 상세는 `.claude/skills/` 에 있고 해당 작업을 시작할 때 자동으로 로드된다 — `external-apis`(외부 API 연동), `legacy-migration`(backup/ 이관), `sidecar-runtime`(파이썬 사이드카), `verification-pipeline`(환각 검증).

기계적으로 판정 가능한 규칙은 `.claude/settings.json` 의 훅이 강제한다. 과거 사고 이력은 `docs/incidents.md` 에 있다.

**이 파일에는 코드를 쓸 때 매번 필요한 것만 남긴다.** 특정 작업에서만 필요하면 스킬로, 정규식·명령으로 검증되면 훅으로 보낸다. 규칙은 **같은 실수가 두 번 발생했을 때만** 추가한다 — 한 번은 노이즈, 두 번이 패턴이다.
