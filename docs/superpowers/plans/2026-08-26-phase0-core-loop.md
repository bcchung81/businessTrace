# Phase 0 잔여 + 핵심 루프 실행 플랜 (Task 2a·2b·2c·7·8·9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드카·외부 재무 API 없이 "뉴스 수집 → Anthropic 분석 → 4층 환각 검증" 루프를 인증된 사용자가 끝까지 돌릴 수 있게 한다.

**Architecture:** Next.js 16 App Router 단일 스택. 로직은 `src/lib/services/*`, DB 접근은 `src/lib/repositories/*`, Route Handler 는 얇게. LLM 은 `@anthropic-ai/sdk` 단일, 모델 ID 는 `ANTHROPIC_MODEL` 한 곳. 모든 외부 호출(네이버·구글 RSS·Anthropic)은 주입 가능한 `fetch`/`client` 로 받아 테스트에서 mock 한다.

**Tech Stack:** Next.js 16.3.3 · Prisma 7.10 + `@prisma/adapter-better-sqlite3` · next-auth 5.0.0-beta.32 · `@anthropic-ai/sdk` 0.120 · zod 4 · rss-parser 3.13 · Vitest 4

**Spec:** `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md` (마스터 로드맵, 2026-08-26 갱신 2). 이 문서는 그 중 Task 2·7·8·9 를 실행 단위로 푼 것이다.

## Global Constraints

- Next.js **16.3.3** — `cookies()`·`headers()`·`params` 는 Promise. 미들웨어는 `src/proxy.ts` + `export function proxy`. 예제 복사 전 `node_modules/next/dist/docs/` 확인
- **신규 코드 주석 금지** — `src/**/*.ts(x)` 에 `//` 또는 `/*` 가 있으면 훅이 경고한다
- **루트에 Python 파일 금지** — 훅이 차단한다
- 외부 API·LLM 테스트 **전부 mock**. 네트워크 의존 테스트 금지
- 테스트는 `src/**/*.test.{ts,tsx}` 만 수집된다 (`vitest.config.mts`). `scripts/` 의 테스트는 `src/` 에 둔다
- 커밋은 태스크 단위, 메시지는 각 태스크에 명시. 커밋 훅이 `npm test` + `npm run lint` 를 강제한다
- LLM: 모델 문자열은 `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"` **한 곳**(`src/lib/services/llm.ts`)에만 둔다. `temperature`/`top_p` 는 보내지 않는다(Sonnet 5 에서 400). 사고는 `thinking: {type: "adaptive"}`, 결정성은 `output_config.effort`
- 레거시 프롬프트 문구는 `backup/app/news_analyzer.py` 에서 **그대로** 옮긴다. 문구를 고치지 않는다
- 환경변수 이름: `DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `NCP_APIGW_API_KEY_ID`, `NCP_APIGW_API_KEY`

---

## 파일 구조

```
prisma/schema.prisma                         2a
prisma.config.ts                             2a
src/lib/db.ts                                2a  Prisma 클라이언트 싱글턴
.env.example                                 2a
src/lib/services/password.ts                 2b  werkzeug scrypt 호환
src/auth.ts                                  2b  NextAuth 설정
src/app/api/auth/[...nextauth]/route.ts      2b
src/proxy.ts                                 2b  라우트 보호
src/app/login/page.tsx                       2b
scripts/migrate-legacy.ts                    2c  1회 이관 (tsx 로 실행)
src/lib/services/legacyMigration.ts          2c  이관 로직 (테스트 가능)
src/lib/services/newsCollector.ts            7   네이버 HUB + 구글 RSS + 중복제거
src/lib/services/pressMapping.json           7   backup 에서 복사
src/lib/services/articleBody.ts              7   기사 본문 크롤링 + 구글 RSS 링크 복원
src/app/api/news/route.ts                    7
src/lib/services/llm.ts                      8   Anthropic 클라이언트·모델 단일 출처
src/lib/services/analyzer.ts                 8   뉴스별 3분석 + 종합의견
src/lib/services/prompts/legacy.ts           8   레거시 프롬프트 문자열 (복사)
src/lib/repositories/analysisRun.ts          8
src/app/api/analyze/route.ts                 8   SSE
src/lib/services/verification.ts             9   4층 검증
src/lib/repositories/verificationResult.ts   9
src/app/api/verification/route.ts            9
```

---

### Task 2a: Prisma 스키마와 DB 클라이언트 — ✅ 완료 (2026-08-27)

**구현 결과**: 테스트 8건 추가(전체 30건 통과), `npm run lint`·`npm run build` 통과.

**파일**: `prisma/schema.prisma` · `prisma.config.ts` · `src/lib/db.ts` · `src/lib/test-support/db.ts` · `.env.example` · 마이그레이션 3개

**구현한 모델 5개**: `User` · `Company` · `Archive` · `AnalysisRun` · `VerificationResult`

**의도적으로 뺀 모델 5개**: `RiskAlert`(Task 11) · `SelectionRecord`(Task 14) · `FinancialSnapshot`(Task 6) · `DartCorpCode`(Task 5) · `ResearchJob`(Task 15). 지금 넣으면 그 동작을 검증하는 테스트가 없어 TDD 의 "실패 테스트 없이 프로덕션 코드 없음" 을 어긴다. 각 태스크가 자기 테스트와 함께 마이그레이션을 추가한다 — 개발 단계 SQLite 라 마이그레이션 추가 비용은 없다.

**테스트가 고정한 동작** (`src/lib/db.test.ts`, `src/lib/repositories/{company,analysisRun}.test.ts`):
- 클라이언트가 실제로 연결되고 `user` 테이블을 읽는다
- `Company` 는 같은 이름을 다른 연도에 허용하고 같은 연도에는 거부한다 (레거시 `unique_company_year` 계승)
- `businessNo`·`industry` 는 null 로 시작한다 — DART 조회가 나중에 채운다
- `AnalysisRun.formulaVersion` 기본값이 `v2-anthropic` 이고 `status` 는 `running`
- `AnalysisRun` 삭제 시 `VerificationResult` 가 함께 삭제된다
- `VerificationResult` 점수 3종은 nullable — **judge 실패가 0점으로 보이면 안 된다**
- `VerificationResult` 는 실행당 1건만 허용

**실측으로 확인한 함정** (문서·추측과 달랐던 것):

| 항목 | 실제 |
|---|---|
| 어댑터 클래스명 | `PrismaBetterSqlite3` — `SQLite3` 가 아니다 |
| `prisma migrate dev` | **클라이언트를 재생성하지 않는다.** `npm run db:migrate` 가 `migrate dev && prisma generate` 를 체인한다. 이걸 놓치면 새 모델이 `undefined` 로 나온다 |
| `prisma.config.ts` | `{ schema, migrations: { path }, datasource: { url } }` — `defineConfig` 는 `prisma/config` 에서 import |
| 테스트 환경 | jsdom 에서 Prisma·better-sqlite3 가 그대로 동작한다. node 환경 분리 불필요 |
| 테스트 병렬 실행 | **DB 테스트 파일이 서로의 행을 지워 FK 위반이 난다.** `fileParallelism: false` + FK 순서대로 지우는 `resetDatabase()` 헬퍼로 해결. 정리 순서는 verification → analysisRun → archive → company → user |
| `@types/node` 상향 | `NodeJS.ProcessEnv` 의 `NODE_ENV` 가 필수가 돼 기존 `src/hooks.test.ts` 빌드가 깨졌다. `env: { ...process.env, ...env }` 로 수정 |

**스크립트**: `db:generate` · `db:migrate` · `db:migrate:test`(테스트 DB 에 deploy) · `postinstall`(clone 후 자동 generate — `src/generated` 는 gitignore 된다)


### Task 2b: Credentials 인증 + 레거시 scrypt 호환 — ✅ 완료 (2026-08-27)

**구현 결과**: 테스트 22건 추가(전체 52건 통과), `npm run lint`·`npm run build` 통과, 실제 dev 서버로 로그인 전 경로 확인.

**파일**: `src/lib/services/password.ts` · `src/lib/services/authenticate.ts` · `src/lib/routeAccess.ts` · `src/auth.ts` · `src/proxy.ts` · `src/app/api/auth/[...nextauth]/route.ts` · `src/app/login/page.tsx` · `src/components/layout/login-form.tsx` · shadcn `input`·`label`

**테스트가 고정한 동작**:
- werkzeug 가 만든 실제 해시로 로그인된다 — `backup/` 파이썬 환경에서 `generate_password_hash('Passw0rd!')` 를 돌려 얻은 값을 픽스처로 박았다. **이 값이 호환성의 유일한 증거다**
- 신규 가입도 같은 `scrypt:32768:8:1$salt$hex` 형식으로 저장한다 — 이관 계정과 신규 계정이 한 컬럼을 공유한다
- 다른 알고리즘(`pbkdf2:`)·깨진 해시는 예외를 던지지 않고 `false`
- 이메일은 공백 제거 + 소문자로 정규화한다 (Flask `User.__init__` 과 동일)
- 비활성 계정은 비밀번호가 맞아도 거부
- 반환값에 `passwordHash` 가 없다 — 세션 계층으로 새지 않는다
- 공개 경로는 `/login`·`/api/auth` 뿐이고 `/loginhack`·`/api/authorize` 같은 유사 접두사는 막힌다

**설계 결정 — 테스트가 강제한 분리**: `proxy.ts` 를 그대로 테스트하려 했더니 next-auth 가 `next/server` 를 vitest 에서 해석하지 못해 실패했다. 순수 정책을 `src/lib/routeAccess.ts` 로, 인증 판정을 `src/lib/services/authenticate.ts` 로 빼고 `auth.ts`·`proxy.ts` 는 프레임워크 배선만 남겼다. CLAUDE.md 의 "Route Handler 는 얇게" 와 같은 방향이다.

**실측으로 확인한 함정**:

| 항목 | 실제 |
|---|---|
| `promisify(crypto.scrypt)` | options 오버로드를 잃는다. `as (password, salt, keylen, options: ScryptOptions) => Promise<Buffer>` 로 명시해야 빌드가 통과한다 |
| next-auth v5 + vitest | `@/auth` 를 import 하는 순간 `Cannot find module 'next/server'` 로 죽는다. 테스트 대상은 next-auth 를 물지 않는 모듈로 분리한다 |
| `zod` v4 | `z.string().email()` 은 deprecated — `z.email()` 을 쓴다 |
| `AUTH_SECRET` | 없으면 dev 에서도 세션이 서명되지 않는다. `.env` 에 `openssl rand -base64 32` 로 생성해 넣었다 |

**dev 서버 실측 검증** (`npm run dev` + curl):

| 시나리오 | 결과 |
|---|---|
| 미인증으로 `/` 접근 | `307 → /login?callbackUrl=%2F` |
| 올바른 비밀번호 | `302 → /`, 세션에 `smoke@example.com` |
| 인증 쿠키로 `/` 접근 | `200` |
| 틀린 비밀번호 | `302 → /login?error=CredentialsSignin`, 세션 `null` |
| 비활성 계정 + 올바른 비밀번호 | `302 → /login?error=CredentialsSignin`, 세션 `null` |

검증용 계정은 확인 후 삭제했다.

### Task 2c: 관리자 계정 부트스트랩 — ✅ 완료 (2026-08-27)

**레거시 데이터는 이관하지 않는다 (2026-08-27 결정).** 신규 시스템을 실행해 데이터를 새로 만든다. 이전 계획의 `migrate-legacy.ts` 는 폐기한다. `backup/instance/news_homepage.db` 의 users 10 / archives 3 / companies 42 는 참조용으로만 남는다.

**이 제품은 관리자 전용이다.** 공개 회원가입을 열지 않는다 — 우수기업 선정 근거를 만드는 내부 도구라 계정은 운영자가 발급한다. 자율 가입은 향후 확장 사항으로 두고, 지금은 확장 지점만 남긴다(`User` 에 role 컬럼을 넣지 않는다 — 전원이 관리자다. 역할 분리가 필요해지면 그때 추가한다).

**Files:**
- Create: `src/lib/services/passwordPolicy.ts`, `src/lib/services/adminAccount.ts`, `scripts/create-admin.ts`
- Test: `src/lib/services/passwordPolicy.test.ts`, `src/lib/services/adminAccount.test.ts`

**Interfaces:**
- Consumes: `prisma` (2a), `hashPassword` (2b)
- Produces:
```ts
export type PasswordCheck = { ok: true } | { ok: false; message: string };
export function checkPasswordStrength(password: string): PasswordCheck;
export function createAdminAccount(input: { email: string; password: string }): Promise<
  { ok: true; id: number; email: string } | { ok: false; message: string }
>;
```

**비밀번호 규칙은 레거시 `backup/app/models.py:validate_password` 를 그대로 옮긴다** — 8자 이상 128자 이하, 영문·숫자·특수문자 중 2가지 이상 조합. 운영에서 쓰던 규칙이라 계정 발급 기준이 달라지면 혼란이 생긴다.

- [ ] **Step 1: 실패 테스트 — 비밀번호 정책**

경계값을 고정한다: 7자 거부 / 8자 허용 / 129자 거부 / 영문만 거부 / 영문+숫자 허용 / 영문+특수문자 허용 / 숫자+특수문자 허용 / 빈 문자열 거부. 메시지는 레거시 문구 그대로.

- [ ] **Step 2: 실패 테스트 — 계정 생성**

이메일 정규화(공백·대소문자), 중복 이메일 거부, 약한 비밀번호 거부(정책 재사용), 저장된 해시가 `verifyPassword` 로 검증되는지, 반환값에 해시가 없는지.

- [ ] **Step 3: 구현 후 통과 확인**

- [ ] **Step 4: CLI 래퍼**

`scripts/create-admin.ts` 는 얇게 유지한다 — 인자 파싱 → `createAdminAccount` 호출 → 결과 출력, 실패 시 exit 1.

```bash
npx tsx scripts/create-admin.ts <email> <password>
```

비밀번호를 인자로 받으면 셸 히스토리에 남는다. `ADMIN_PASSWORD` 환경변수를 우선 읽고, 없을 때만 인자를 쓴다.

- [ ] **Step 5: 커밋** — `feat: admin account bootstrap script`

**구현 결과**: 테스트 11건 추가(전체 63건 통과), lint·build 통과. CLI 로 만든 계정으로 dev 서버 로그인까지 확인했다.

| CLI 경로 | 결과 |
|---|---|
| 인자 없음 | usage 출력, exit 1 |
| 약한 비밀번호 | `비밀번호는 최소 8자 이상이어야 합니다.`, exit 1 |
| 잘못된 이메일 | `올바른 이메일 형식이 아닙니다.`, exit 1 |
| 정상 | `계정 생성 완료 — admin@kca.kr (id 3)`, exit 0 |
| 중복 | `이미 등록된 이메일입니다.`, exit 1 — 기존 비밀번호는 그대로 |

**실측 함정**: `scripts/*.ts` 에서 **top-level await 가 안 된다.** `package.json` 에 `type: module` 이 없어 tsx 가 CJS 로 트랜스파일하고 esbuild 가 거부한다(`Top-level await is currently not supported with the "cjs" output format`). 스크립트는 `async function main()` 으로 감싸고 마지막에 `main()` 을 호출한다.

---

### Task 2d: 기업 관리

관리자가 분석 대상 기업을 등록·수정·비활성화한다. **Task 7~9 가 실제 기업 데이터 위에서 돌려면 이것이 선행돼야 한다** — 레거시 이관을 하지 않으므로 기업 42건도 새로 입력한다.

**Files:**
- Create: `src/lib/repositories/companyRepository.ts`, `src/app/api/companies/route.ts`, `src/app/api/companies/[id]/route.ts`, `src/app/companies/page.tsx`, `src/components/layout/company-table.tsx`
- Test: `src/lib/repositories/companyRepository.test.ts`

**Interfaces:**
- Produces: `listCompanies(year?)`, `createCompany({name, year, businessNo?, industry?})`, `updateCompany(id, patch)`, `deactivateCompany(id)`

레거시 `routes.py:4450~4626` 의 `/api/companies` GET·POST·PUT·DELETE·`/years` 구성을 참조하되, **삭제는 하드 삭제 대신 `isActive=false`** 로 한다 — 분석 이력(`AnalysisRun`)이 기업을 참조하므로 지우면 이력이 끊긴다.

일괄 등록이 필요하다(50개사). CSV 또는 줄바꿈 구분 텍스트를 붙여넣어 `name` 목록을 한 번에 만드는 경로를 포함한다. 연도는 화면에서 선택한다.

**커밋**: `feat: company management for admins`

---

### Task 7: 뉴스 수집 서비스 (네이버 API HUB + 구글 RSS)

**Files:**
- Create: `src/lib/services/newsCollector.ts`, `src/lib/services/articleBody.ts`, `src/lib/services/pressMapping.json` (`cp backup/domain_press_mapping.json`), `src/app/api/news/route.ts`
- Test: `src/lib/services/newsCollector.test.ts`, `src/lib/services/articleBody.test.ts`, fixture `src/lib/services/__fixtures__/naver-news.json`, `src/lib/services/__fixtures__/google-news.rss`, `src/lib/services/__fixtures__/article-naver.html`

**본문 보강 결정 (2026-08-27):** 레거시는 구글 RSS 항목에 본문이 없어 OpenAI `responses.create` + `web_search_preview` 로 LLM 이 원문을 읽게 했다 (`news_analyzer.py:2078·2241`). 신규는 **LLM 웹검색을 쓰지 않고 Task 7 에서 본문을 직접 크롤링**한다. 근거: (1) LLM 호출 비용·지연이 사라진다 (2) 검증 층③ evidence-match 가 원문을 얻는다 (3) 레거시도 네이버·구글 모두 `_fetch_article_content` 크롤링을 먼저 시도하고 실패 시에만 웹검색으로 갔다 (`news_analyzer.py:1600~1616`). 크롤링 실패 시 `content` 는 `description` 으로 폴백하고 LLM 에 그대로 넘긴다 — 웹검색 폴백은 두지 않는다.

**Interfaces:**
- Produces:
```ts
export type NewsItem = {
  title: string;
  link: string;
  description: string;
  content: string;
  published: string;
  source: string;
  provider: "naver" | "google";
  titleMatch: boolean;
  mentions: number;
  relevance: "primary" | "mention" | "unrelated";
};
export function resolveGoogleNewsUrl(link: string, deps?: { fetch?: typeof fetch }): Promise<string>;
export function fetchArticleBody(url: string, deps?: { fetch?: typeof fetch }): Promise<string>;
export function enrichWithBodies(items: NewsItem[], deps?: { fetch?: typeof fetch; concurrency?: number }): Promise<NewsItem[]>;
export type CollectOptions = {
  query: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  naver?: boolean;
  google?: boolean;
  duplicateThreshold?: number;
};
export type CollectResult = {
  items: NewsItem[];
  duplicatesRemoved: number;
  primaryCount: number;
  noNews: boolean;
};
export function collectNews(opts: CollectOptions, deps?: { fetch?: typeof fetch }): Promise<CollectResult>;
export function removeDuplicates(items: NewsItem[], threshold: number): { items: NewsItem[]; removed: number };
export function pressNameFromUrl(url: string): string;
```

- [ ] **Step 1: 실패 테스트**

`src/lib/services/newsCollector.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { collectNews, removeDuplicates, pressNameFromUrl } from "@/lib/services/newsCollector";
import type { NewsItem } from "@/lib/services/newsCollector";

const naverFixture = readFileSync(new URL("./__fixtures__/naver-news.json", import.meta.url), "utf8");
const googleFixture = readFileSync(new URL("./__fixtures__/google-news.rss", import.meta.url), "utf8");

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("naverapihub.apigw.ntruss.com")) return new Response(naverFixture, { status: 200 });
    if (url.includes("news.google.com/rss")) return new Response(googleFixture, { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("collectNews", () => {
  it("uses API HUB endpoint and headers", async () => {
    process.env.NCP_APIGW_API_KEY_ID = "id";
    process.env.NCP_APIGW_API_KEY = "key";
    const fetch = mockFetch();
    await collectNews({ query: "넷록스", google: false }, { fetch });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("https://naverapihub.apigw.ntruss.com/search/v1/news");
    expect((init as RequestInit).headers).toMatchObject({ "X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "key" });
  });

  it("merges naver and google, maps press names, strips html", async () => {
    const { items } = await collectNews({ query: "넷록스" }, { fetch: mockFetch() });
    expect(items.some((i) => i.provider === "naver")).toBe(true);
    expect(items.some((i) => i.provider === "google")).toBe(true);
    expect(items.every((i) => !i.title.includes("<b>"))).toBe(true);
  });

  it("filters by period", async () => {
    const { items } = await collectNews({ query: "넷록스", startDate: "2030-01-01" }, { fetch: mockFetch() });
    expect(items).toHaveLength(0);
  });

  it("throws a typed error on 429", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(collectNews({ query: "x", google: false }, { fetch })).rejects.toThrow(/rate limit/i);
  });
});

describe("removeDuplicates", () => {
  const base: NewsItem = { title: "", link: "", description: "", content: "", published: "2025-01-01", source: "", provider: "naver" };
  it("drops near-identical titles above threshold", () => {
    const { items, removed } = removeDuplicates(
      [{ ...base, title: "넷록스, 시리즈A 투자 유치" }, { ...base, title: "넷록스 시리즈A 투자유치" }, { ...base, title: "전혀 다른 기사" }],
      0.5,
    );
    expect(items).toHaveLength(2);
    expect(removed).toBe(1);
  });
  it("threshold 0 disables dedupe", () => {
    const { removed } = removeDuplicates([{ ...base, title: "a" }, { ...base, title: "a" }], 0);
    expect(removed).toBe(0);
  });
});

describe("pressNameFromUrl", () => {
  it("maps known domain", () => {
    expect(pressNameFromUrl("https://www.yna.co.kr/view/1")).toBe("연합뉴스");
  });
  it("falls back to hostname", () => {
    expect(pressNameFromUrl("https://unknown.example.com/a")).toBe("unknown.example.com");
  });
});
```

`src/lib/services/articleBody.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveGoogleNewsUrl, fetchArticleBody, enrichWithBodies } from "@/lib/services/articleBody";
import type { NewsItem } from "@/lib/services/newsCollector";

const naverHtml = readFileSync(new URL("./__fixtures__/article-naver.html", import.meta.url), "utf8");

describe("resolveGoogleNewsUrl", () => {
  const token = "REPLACE_WITH_REAL_TOKEN_FROM_backup/test_flask_import.py:27";
  const link = `https://news.google.com/rss/articles/${token}?oc=5`;

  it("resolves via batchexecute when google returns signature and url", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(')]}\'\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.yna.co.kr/view/1\\",1]"]]', { status: 200 });
      return new Response('<c-wiz data-p="%.@.[\\"garturlreq\\",[[\\"X\\"]],\\"sig123\\",\\"1700000000\\"]"></c-wiz>', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await resolveGoogleNewsUrl(link, { fetch })).toBe("https://www.yna.co.kr/view/1");
  });

  it("falls back to base64 for legacy tokens", async () => {
    const legacy = "https://news.google.com/rss/articles/" + Buffer.from("\x08\x13\"\x1chttps://www.yna.co.kr/view/2\xd2\x01\x00", "binary").toString("base64url") + "?oc=5";
    const fetch = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await resolveGoogleNewsUrl(legacy, { fetch })).toBe("https://www.yna.co.kr/view/2");
  });

  it("returns non-google links unchanged without fetching", async () => {
    const fetch = vi.fn() as unknown as typeof fetch;
    expect(await resolveGoogleNewsUrl("https://www.yna.co.kr/view/1", { fetch })).toBe("https://www.yna.co.kr/view/1");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the input when both strategies fail", async () => {
    const bad = "https://news.google.com/rss/articles/not-base64?oc=5";
    const fetch = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await resolveGoogleNewsUrl(bad, { fetch })).toBe(bad);
  });
});

describe("fetchArticleBody", () => {
  it("extracts body text using article selectors", async () => {
    const fetch = vi.fn(async () => new Response(naverHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as unknown as typeof fetch;
    const body = await fetchArticleBody("https://n.news.naver.com/article/1/2", { fetch });
    expect(body.length).toBeGreaterThan(100);
    expect(body).not.toMatch(/<script|<style/);
  });
  it("returns empty string on non-200 or timeout", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    expect(await fetchArticleBody("https://x.kr/a", { fetch })).toBe("");
  });
  it("decodes euc-kr pages", async () => {
    const bytes = new TextEncoder().encode("<html><body><div id='articleBody'>본문</div></body></html>");
    const fetch = vi.fn(async () => new Response(bytes, { status: 200, headers: { "content-type": "text/html; charset=euc-kr" } })) as unknown as typeof fetch;
    const body = await fetchArticleBody("https://x.kr/a", { fetch });
    expect(typeof body).toBe("string");
  });
});

describe("enrichWithBodies", () => {
  const item: NewsItem = { title: "t", link: "https://x.kr/a", description: "desc", content: "", published: "2025-01-01", source: "s", provider: "naver" };
  it("fills content and falls back to description when fetch fails", async () => {
    const fetch = vi.fn(async (u: RequestInfo | URL) => (String(u).endsWith("/ok") ? new Response("<div id='articleBody'>긴 본문 ".repeat(30) + "</div>", { status: 200 }) : new Response("", { status: 500 }))) as unknown as typeof fetch;
    const out = await enrichWithBodies([{ ...item, link: "https://x.kr/ok" }, item], { fetch, concurrency: 2 });
    expect(out[0].content.length).toBeGreaterThan(50);
    expect(out[1].content).toBe("desc");
  });
});
```

`REPLACE_WITH_REAL_ENCODED_LINK…` 는 `backup/test_flask_import.py:27` 의 실제 인코딩 링크를 붙여넣는다 — 디코딩 규칙의 유일한 실측 증거다.

Fixture 는 실제 응답 형태로 만든다 — 네이버는 `{ total, start, display, items: [{ title, originallink, link, description, pubDate }] }`, 구글은 `<rss><channel><item><title>제목 - 언론사</title><link/><pubDate/><source url="...">언론사</source></item>`. `yna.co.kr → 연합뉴스` 매핑이 `pressMapping.json` 에 있는지 먼저 `grep` 으로 확인하고 없으면 있는 도메인으로 테스트를 바꾼다.

Run: `npx vitest run src/lib/services/newsCollector.test.ts` → FAIL

- [ ] **Step 2: 구현**

```bash
npm i rss-parser
```

`pressMapping.json` 은 단순 복사가 아니라 **두 벌을 병합**해 만든다 — `backup/domain_press_mapping.json`(181건, 미사용 사본)과 `backup/app/news_service.py:25~199` 의 하드코딩 `domain_to_press`(실제 동작본). 충돌 시 하드코딩 쪽 값을 쓴다. 병합은 1회성이므로 스크립트를 남기지 않고 결과 JSON 만 커밋하되, 건수(≥181)를 완료 노트에 적는다.

`fetchNaver` 규약 (2026-08-27 실측 5개사 검증 반영):
- **정확검색**: `query` 를 `"기업명"` 처럼 큰따옴표로 감싼다 (`news_service.py:464~`)
- **`sort=sim` 을 기본으로 한다 — `sort=date` 가 아니다.** 네이버 뉴스 검색은 **본문까지 매칭**하므로 회사명이 스쳐 지나간 무관한 기사가 대량으로 섞인다. 실측(상위 30건 중 제목에 회사명이 포함된 비율):

  | 기업 | `sort=date` | `sort=sim` |
  |---|---|---|
  | 크립토랩 | 17/30 | **25/30** |
  | 올림플래닛 | 14/30 | **29/30** |
  | 페어리 | **1/30** | 15/30 |
  | 넷록스 | 4/26 | 4/26 |
  | 논스랩 | 0/30 | 0/30 |

  "페어리" 처럼 일반명사와 겹치는 상호는 `date` 정렬에서 게임·애니 기사로 뒤덮인다(30건 중 29건이 무관). 분석 대상을 상위 N건으로 자르는 구조에서는 정렬 기준이 곧 분석 품질이다.

  **레거시는 이 문제를 그대로 안고 운영됐다**: 옥타코 리포트 143건 중 제목매치 13건(9%), 타사 악재가 섞여 감성 평균이 7.31 → 5.78 로 깎였다. [`docs/incidents.md` 2026-08-27 항목](../../incidents.md) 참조. 레거시의 `title_match or content_match` 필터는 네이버 `description` 이 매칭 문맥이라 사실상 무력했다 — **같은 필터를 이관하면 같은 결과가 나온다**
- **관련도 3등급을 기록한다** (`NewsItem.relevance`). 본문을 크롤링하므로 레거시가 못 하던 판별이 가능하다 — 레거시는 네이버 스니펫만 봐서 "언급됨" 과 "주제임" 을 구분할 수 없었다. 본문 확보 후 계산한다:

  ```
  mentions = 본문 내 회사명 등장 횟수, firstPos = 첫 등장 위치 / 본문 길이

  primary   : titleMatch || mentions >= 3 || (mentions >= 2 && firstPos < 0.15)
  mention   : mentions >= 1                     — 언급은 되나 기사 주제가 아님
  unrelated : mentions === 0                    — 본문에 회사명이 없음
  ```

  실측 판별력(2026-08-27, 본문 크롤링 후):

  | 기업 | 제목매치 기사 | 본문에만 있는 기사 |
  |---|---|---|
  | 넷록스 | 평균 8.5회 언급, 첫등장 11% 지점 | 평균 **1.1회**, 첫등장 43% 지점 (21건 중 18건이 1회) |
  | 페어리 | 평균 4.6회 | 평균 **1.5회** (16건 중 11건이 1회) |
  | 옥타코 | 평균 8.0회, 리드 300자 내 39/40 | `sort=sim` 에서 0건 |

  **언급 1회는 거의 예외 없이 스쳐 지나가는 언급이다** — 「TTA·6G포럼, 필리핀·말레이 통신사와 B5G·6G 교류」 본문 27% 지점에 참여기업으로 한 번 나오는 식이다

- **`mention` 등급을 버리지 않는다.** 위 TTA 사례는 넷록스가 실제로 참여한 사업 실적이라 삭제하면 정보를 잃는다. 대신 **감성 점수 집계에서 제외**한다 — 옥타코 사고의 직접 원인이 타사 악재(SK쉴더스 해킹 −6, 다크웹 유출 −8)를 옥타코 감성에 합산한 것이었다. 리포트에는 "언급 기사" 로 구분 표기하고, 수상·투자 판정은 `primary` 기사에서만 인정한다
- **주의 — 부분 문자열 오탐**: 한국어는 단어 경계가 없어 `includes` 가 오탐을 낸다. 실측에서 "페어리" 가 식물 기사 본문에 7회 나왔는데 페어리링(균사체) 이었다. `mentions >= 3` 만으로 `primary` 를 주면 이런 기사가 통과한다 — Task 8 프롬프트에 "이 기사가 대상 기업에 관한 것인지 먼저 판단하라" 를 넣어 LLM 이 2차로 걸러내게 하고, 그 판단을 `NewsAnalysis.isAboutCompany` 로 받아 집계에서 제외한다
  - **이 방식은 레거시에서 이미 입증됐다.** 레거시 수상·투자 프롬프트에는 "반드시 '{회사}' 회사가 **직접** 받은 수상이어야 합니다" 가르드가 있었고(`news_analyzer.py:1960·2007`), 옥타코 143건 × 2항목 = 286칸 중 Y 는 19건뿐이었다 — 오염된 입력에도 오탐을 억제했다. **동향(감성) 프롬프트에만 이 가드가 없었다** — "다음은 '{회사}' 회사에 대한 뉴스입니다" 로 단정하고 넘어간다(`:1905`). 143건 전부에 감성 점수가 매겨진 이유이고, 평균이 7.31 → 5.78 로 깎인 이유다. **가드를 감성에도 적용하는 것이 이 사고의 핵심 수정이다**
- 정렬은 `primary` 우선, 동률이면 최신순
- **`primary` 가 0건이면 "뉴스 없음" 으로 판정한다**: 논스랩은 100건 중 제목 매치 0건이었다. 이 경우 수집된 항목 전부가 노이즈이므로 분석에 넘기면 다른 회사 뉴스로 평가가 만들어진다. `AnalysisRun.status = "no_news"` 로 종료하고 리포트에 "분석 가능한 뉴스 없음" 을 명시한다 — **환각 방지의 첫 관문이다**
- **페이징**: `display=100`, `start` 1·101·201…, `start <= 1000`(API 상한). `items` 가 비거나 `display` 미만이면 중단. `sort=sim` 에서는 기간 기반 조기 종료가 불가능하므로 기간 필터는 수집 후 적용한다
- 실측 소요: 기업당 1.2~5.9초 (수집 + 본문 30건 크롤링 포함, 동시성 4)

`src/lib/services/newsCollector.ts` 핵심:
```ts
import Parser from "rss-parser";
import pressMapping from "./pressMapping.json";

export class NewsRateLimitError extends Error {}

const NAVER_HUB = "https://naverapihub.apigw.ntruss.com/search/v1/news";

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export function pressNameFromUrl(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const table = pressMapping as Record<string, string>;
  return table[host] ?? table[`www.${host}`] ?? host;
}

async function fetchNaver(query: string, display: number, fetchImpl: typeof fetch): Promise<NewsItem[]> {
  const url = new URL(NAVER_HUB);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");
  const res = await fetchImpl(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": process.env.NCP_APIGW_API_KEY_ID ?? "",
      "X-NCP-APIGW-API-KEY": process.env.NCP_APIGW_API_KEY ?? "",
    },
  });
  if (res.status === 429) throw new NewsRateLimitError("naver rate limit exceeded");
  if (!res.ok) throw new Error(`naver ${res.status}`);
  const body = (await res.json()) as { items: { title: string; originallink: string; link: string; description: string; pubDate: string }[] };
  return body.items.map((it) => ({
    title: stripHtml(it.title),
    link: it.originallink || it.link,
    description: stripHtml(it.description),
    content: stripHtml(it.description),
    published: new Date(it.pubDate).toISOString(),
    source: pressNameFromUrl(it.originallink || it.link),
    provider: "naver",
  }));
}

async function fetchGoogle(query: string, fetchImpl: typeof fetch): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetchImpl(url, { headers: { Accept: "application/rss+xml, application/xml" } });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const feed = await new Parser().parseString(await res.text());
  return feed.items.map((it) => ({
    title: stripHtml(it.title ?? "").replace(/\s-\s[^-]+$/, ""),
    link: it.link ?? "",
    description: stripHtml(it.contentSnippet ?? it.content ?? ""),
    content: stripHtml(it.contentSnippet ?? it.content ?? ""),
    published: it.isoDate ?? new Date(it.pubDate ?? Date.now()).toISOString(),
    source: (it as { source?: string }).source ?? "Google News",
    provider: "google",
  }));
}

function bigrams(s: string) {
  const norm = s.replace(/[\s\p{P}]/gu, "").toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2));
  return set;
}

export function titleSimilarity(a: string, b: string) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return (2 * inter) / (x.size + y.size);
}

export function removeDuplicates(items: NewsItem[], threshold: number) {
  if (threshold <= 0) return { items, removed: 0 };
  const kept: NewsItem[] = [];
  let removed = 0;
  for (const item of items) {
    const dup = kept.some((k) => titleSimilarity(k.title, item.title) >= threshold);
    if (dup) removed++;
    else kept.push(item);
  }
  return { items: kept, removed };
}
```

`collectNews` 는 옵션 기본값 `naver: true, google: true, duplicateThreshold: 0.5, limit: 100`, 두 소스를 `Promise.allSettled` 로 병렬 수집 → 한쪽 실패는 경고로 남기고 진행(단 `NewsRateLimitError` 는 그대로 던진다) → 기간 필터 → 중복 제거 → 최신순 정렬 → `limit` 절단 → **`enrichWithBodies` 로 본문 보강**. 뉴스 API HUB 는 키당 50 RPS 라 1회 수집에서 초과할 일은 없으므로 큐는 두지 않는다. 수집 단계의 `content` 초기값은 `description`.

`src/lib/services/articleBody.ts` — 레거시 세 구현(`news_analyzer.py:1370 _fetch_article_content`, `routes.py:3791 _fetch_full_article_content`, `news_service.py:786`)을 참조해 **하나로** 재작성한다:

```bash
npm i @mozilla/readability jsdom iconv-lite cheerio
```
`jsdom` 은 이미 devDependency(vitest) 에 있으나 런타임에서 쓰므로 dependencies 로 올린다. 전부 Apache-2.0/MIT.

- `resolveGoogleNewsUrl(link, {fetch})` — **비동기**. `news.google.com/rss/articles/<token>` 이 아니면 입력 그대로 반환. 2024년 이후 토큰은 base64 가 아니므로 2단계로 간다 (레거시는 `googlenewsdecoder` 패키지를 **런타임 pip install** 해서 썼다 — `news_analyzer.py:1162~1200`. 신규는 같은 프로토콜을 자체 구현하고 패키지는 쓰지 않는다):
  1. **batchexecute 복원**: `GET https://news.google.com/rss/articles/<token>` HTML 에서 `c-wiz[data-p]` 의 `data-p` 값을 읽어 `signature`·`timestamp` 를 얻고, `POST https://news.google.com/_/DotsSplashUi/data/batchexecute` 에 `f.req=[[["Fbv4je","[\"garturlreq\",[[\"X\",\"X\",[\"ko\",\"KR\"],null,null,1,1,\"KR:ko\",null,180,null,null,null,null,null,0,null,null,[1765,1000]],\"ko\",\"KR\",1,[2,3,4,8],1,0,\"655000234\",0,0,null,0],\"<token>\",<timestamp>,\"<signature>\"]",null,"generic"]]]` 를 보내 응답 JSON 의 `garturlres` 뒤 URL 을 추출. 실패하면 2 로
  2. **base64 폴백** (구형 토큰): 레거시 `_try_decode_methods`(`news_analyzer.py:1280~1340`) 순서 — 표준 base64 → urlsafe → 패딩 보정 — 로 디코드해 첫 `http` URL 추출
  3. 둘 다 실패 → 입력 그대로 반환. `fetchArticleBody` 는 `news.google.com` 링크를 크롤링하지 않고 `""` 를 돌려준다 (구글 페이지는 JS 리다이렉트라 본문이 없다)
  - **2026-08-27 실측 검증 완료: 7/7 복원 성공(100%)**, 전부 batchexecute 경로. base64 폴백은 한 번도 쓰이지 않았다(2024년 이후 토큰). 확인된 정확한 구현:
    - 시그니처는 `$("[data-n-a-sg]").first()` 의 `data-n-a-sg`·`data-n-a-ts` 속성이다 (`c-wiz[data-p]` 파싱은 불필요)
    - 응답은 `)]}'` 프리픽스 뒤 JSON. `outer.find(f => f[0]==="wrb.fr" && f[1]==="Fbv4je")` → `JSON.parse(frame[2])` → `[0]==="garturlres"` 이면 `[1]` 이 원문 URL
    - **정규식으로 URL 을 긁지 말 것** — 응답이 `=` 로 이스케이프돼 있어 정규식 추출은 실패한다. 반드시 2단계 `JSON.parse` 를 쓴다
  - 요청 페이로드 형식은 구글 비공식 엔드포인트라 바뀔 수 있다. 복원율이 50% 미만으로 떨어지면 구글 RSS 소스를 기본 off 로 돌린다 (네이버가 1,000건까지 커버하므로 손실은 작다 — 옥타코 리포트 90건 중 구글 6건)
  - 레거시와 달리 `verify=False`(SSL 미검증)는 쓰지 않는다. 인증서 오류 사이트는 실패로 처리
- `fetchArticleBody(url, {fetch})`: `resolveGoogleNewsUrl` → `AbortSignal.timeout(5000)` + 레거시 User-Agent 로 GET (SSL 검증 유지) → `arrayBuffer` 를 받아 charset 결정(`content-type` 헤더 → `<meta charset>` 순, `euc-kr`/`cp949`/`ks_c_5601` 이면 `iconv-lite` 로 디코드, 그 외 utf-8) → **`@mozilla/readability`** (`new Readability(new JSDOM(html, {url}).window.document).parse()?.textContent`) → 결과가 null 이거나 100자 미만이면 네이버 전용 안전망 `#dic_area` 텍스트(cheerio) 시도 → 그래도 없으면 `""` → 공백 정규화. 어떤 예외도 던지지 않고 `""` 반환
  - **레거시 선택자 방식은 쓰지 않는다** (2026-08-27 실측): 옥타코 리포트 실제 URL 7건에서 레거시 `article`/`.content` 선택자는 Readability 대비 3~5배 긴 텍스트를 냈고, 초과분은 **같은 페이지의 다른 기사 목록·뉴스레터 폼**이었다(techm.kr 4,826자 중 본문 927자). 이 노이즈가 LLM 에 들어가면 다른 회사 뉴스로 판정이 오염되고 검증 층③ 도 무의미해진다. Readability 는 7건 전부 본문만 추출했다(네이버 544자 정확 일치). 벤치 스크립트는 세션 스크래치패드 `bench/bench.mjs` 에 있었다 — 재현하려면 같은 URL 로 다시 돌린다
  - **2026-08-27 실측: 110건 중 107건 성공(97.3%)**, 전부 Readability 경로(`#dic_area` 안전망은 한 번도 쓰이지 않았으나 유지). 실패 3건은 `http-403` 1 · 본문 100자 미만 1 · 파싱 예외 1. charset 은 utf-8 107 / euc-kr 1 — `iconv-lite` 는 1%를 위해 필요하다. 평균 본문 1,300~3,100자
  - 후보 비교(GitHub API 2026-08-27): `@mozilla/readability` 0.6.0 ★11.4K Apache-2.0 주간 330만 DL **채택** / `defuddle` 0.19 ★9.2K MIT 는 캡션·표를 5~40% 더 포함해 2순위 / `@extractus/article-extractor` 는 Readability 래퍼라 결과 동일 / `crawlee` 는 큐·브라우저 풀 프레임워크라 과함 / `trafilatura`(Python) 는 사이드카 의존이 생겨 제외
- `enrichWithBodies(items, {fetch, concurrency = 4})`: 동시성 4 로 순회. `content = body.length > description.length ? body : description`. 본문 최대 4,000자 절단(LLM 입력 상한, 레거시 동일)

`NewsItem.content` 는 Task 8 의 `newsText()` 가 "뉴스 내용" 에 넣는 값이다.

`src/app/api/news/route.ts`: `GET ?query=&startDate=&endDate=&limit=` → zod 파싱 → `collectNews` → JSON. 레이트리밋은 429 로 그대로 전달.

Run: `npx vitest run src/lib/services/newsCollector.test.ts` → PASS

- [ ] **Step 3: 커밋**

```bash
git add src/lib/services/newsCollector.ts src/lib/services/newsCollector.test.ts src/lib/services/articleBody.ts src/lib/services/articleBody.test.ts src/lib/services/__fixtures__ src/lib/services/pressMapping.json src/app/api/news package.json package-lock.json
git commit -m "feat: news collection service in typescript"
```

---

### Task 8: Anthropic 분석 엔진 + SSE

**Files:**
- Create: `src/lib/services/llm.ts`, `src/lib/services/prompts/legacy.ts`, `src/lib/services/analyzer.ts`, `src/lib/repositories/analysisRun.ts`, `src/app/api/analyze/route.ts`
- Test: `src/lib/services/analyzer.test.ts`, `src/lib/services/llm.test.ts`

**Interfaces:**
- Consumes: `NewsItem` (7), `prisma` (2a), `auth()` (2b)
- Produces:
```ts
export type NewsAnalysis = {
  news: NewsItem;
  trend: { news_trend_summary: string; sentiment_score: number; sentiment_label: string };
  award: { is_award_related: boolean; award_name: string; award_reason: string };
  investment: { is_investment_related: boolean; investment_name: string; investment_reason: string };
};
export type AnalysisResult = {
  companyName: string;
  analyses: NewsAnalysis[];
  comprehensiveOpinion: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
};
export type AnalyzeEvent =
  | { type: "progress"; step: "trend" | "award" | "investment" | "opinion"; current: number; total: number }
  | { type: "news_done"; index: number; analysis: NewsAnalysis }
  | { type: "complete"; runId: number; result: AnalysisResult }
  | { type: "error"; message: string };
export function analyzeCompany(companyName: string, news: NewsItem[], deps: { llm: LlmClient }): AsyncGenerator<AnalyzeEvent>;
export type LlmClient = { json<T>(args: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<{ data: T; usage: Usage }> };
```

- [ ] **Step 1: 의존성과 SDK 문서 확인**

```bash
npm i @anthropic-ai/sdk zod
```
`node_modules/@anthropic-ai/sdk/README.md` 에서 `messages.stream`, `output_config.format`, `thinking: {type:"adaptive"}` 사용법을 확인한다. `temperature` 는 쓰지 않는다.

- [ ] **Step 2: 실패 테스트 — LLM 래퍼**

`src/lib/services/llm.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLlmClient, MODEL } from "@/lib/services/llm";

describe("llm client", () => {
  it("defaults model to claude-sonnet-5", () => {
    expect(MODEL).toBe(process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5");
  });

  it("parses structured json and reports usage", async () => {
    const finalMessage = vi.fn(async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ a: 1 }) }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    }));
    const sdk = { messages: { stream: vi.fn(() => ({ finalMessage })) } };
    const llm = createLlmClient(sdk as never);
    const { data, usage } = await llm.json({ system: "s", prompt: "p", schema: z.object({ a: z.number() }) });
    expect(data).toEqual({ a: 1 });
    expect(usage.inputTokens).toBe(10);
    const call = sdk.messages.stream.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("temperature");
    expect(call.thinking).toEqual({ type: "adaptive" });
  });

  it("throws LlmRefusalError on refusal stop reason", async () => {
    const finalMessage = vi.fn(async () => ({ stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } }));
    const sdk = { messages: { stream: vi.fn(() => ({ finalMessage })) } };
    const llm = createLlmClient(sdk as never);
    await expect(llm.json({ system: "s", prompt: "p", schema: z.object({}) })).rejects.toThrow(/refus/i);
  });
});
```

- [ ] **Step 3: LLM 래퍼 구현**

`src/lib/services/llm.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };
export type LlmClient = {
  json<T>(args: { system: string; prompt: string; schema: z.ZodType<T>; effort?: "low" | "medium" | "high" }): Promise<{ data: T; usage: Usage }>;
};

export class LlmRefusalError extends Error {}
export class LlmParseError extends Error {}

export function createLlmClient(sdk: Anthropic): LlmClient {
  return {
    async json({ system, prompt, schema, effort = "medium" }) {
      const message = await sdk.messages
        .stream({
          model: MODEL,
          max_tokens: 8000,
          thinking: { type: "adaptive" },
          output_config: { effort, format: { type: "json_schema", schema: z.toJSONSchema(schema) } },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage();
      if (message.stop_reason === "refusal") throw new LlmRefusalError("model refused the request");
      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new LlmParseError(parsed.error.message);
      return {
        data: parsed.data,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

export function defaultLlmClient() {
  return createLlmClient(new Anthropic({ maxRetries: 3 }));
}
```

`output_config.format` 의 정확한 키 이름은 설치된 SDK 타입(`node_modules/@anthropic-ai/sdk/resources/messages.d.ts`)에서 확인해 맞춘다. 타입 에러가 나면 SDK 가 정답이다.

Run: `npx vitest run src/lib/services/llm.test.ts` → PASS

- [ ] **Step 4: 레거시 프롬프트 복사**

`src/lib/services/prompts/legacy.ts` — `backup/app/news_analyzer.py` 의 다음 문자열을 **문구 그대로** 템플릿 함수로 옮긴다:

| 원본 위치 | 함수 |
|---|---|
| L1904 `trend_prompt` | `trendPrompt(companyName, newsText)` |
| L1959 `award_prompt` | `awardPrompt(companyName, newsText)` |
| L2006 `investment_prompt` | `investmentPrompt(companyName, newsText)` |
| L2275 `_generate_comprehensive_opinion` 내부 프롬프트 | `opinionPrompt(companyName, stats, analyses)` |
| L930 system | `SYSTEM_NEWS = "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요."` |
| L1896 `news_text` | `newsText(item)` — `뉴스 제목/내용/출처/날짜/링크` 5줄. "뉴스 내용" 에는 `item.content` (Task 7 본문 보강 결과) |

**이관하지 않는 것:** `_analyze_google_news_with_web_search`(L2078)·`_call_chatgpt_with_web_search`(L2241)의 OpenAI `web_search_preview` 경로와 그 전용 프롬프트 3종(L2086·2131·2170). Task 7 이 본문을 크롤링하므로 구글 뉴스도 일반 경로(L1904·1959·2006 프롬프트)로 분석한다. `routes.py:1058` 의 인라인 수상 프롬프트는 프론트가 호출하지 않는 `/api/analyze/streaming` 소속 사장 코드 — 정본은 `news_analyzer.py` 다.

프롬프트 끝의 "반드시!!! 다음 JSON 형식으로…" 문단은 **남겨둔다** — 구조화 출력이 형식을 강제하지만 문구를 바꾸면 결과가 달라질 수 있다. 원본과 1:1 diff 가 가능하도록 파이썬 f-string 의 `{{ }}` 만 `{ }` 로 바꾼다.

- [ ] **Step 5: 실패 테스트 — 분석기**

`src/lib/services/analyzer.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { analyzeCompany } from "@/lib/services/analyzer";
import type { LlmClient } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsCollector";

const news: NewsItem[] = [
  { title: "넷록스 수상", link: "https://a.kr/1", description: "d", content: "d", published: "2025-01-01T00:00:00Z", source: "A", provider: "naver" },
  { title: "넷록스 투자", link: "https://a.kr/2", description: "d", content: "d", published: "2025-01-02T00:00:00Z", source: "A", provider: "naver" },
];

function fakeLlm(): LlmClient {
  return {
    json: vi.fn(async ({ prompt }) => {
      const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 };
      if (prompt.includes("동향실적")) return { data: { trend_analysis: { news_trend_summary: "s", sentiment_score: 5, sentiment_label: "긍정적" } }, usage };
      if (prompt.includes("수상")) return { data: { award_analysis: { is_award_related: true, award_name: "대상", award_reason: "r" } }, usage };
      if (prompt.includes("투자")) return { data: { investment_analysis: { is_investment_related: false, investment_name: "", investment_reason: "" } }, usage };
      return { data: { comprehensive_opinion: "종합" }, usage };
    }),
  };
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const e of gen) out.push(e);
  return out as { type: string }[];
}

describe("analyzeCompany", () => {
  it("emits progress per step, news_done per item, then complete", async () => {
    const events = await collect(analyzeCompany("넷록스", news, { llm: fakeLlm() }));
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "news_done")).toHaveLength(2);
    expect(types.at(-1)).toBe("complete");
    expect(types.indexOf("progress")).toBeLessThan(types.indexOf("news_done"));
  });

  it("falls back to neutral trend when a call fails, and still completes", async () => {
    const llm = fakeLlm();
    (llm.json as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("429"));
    const events = await collect(analyzeCompany("넷록스", news, { llm }));
    const done = events.find((e) => e.type === "news_done") as { analysis: { trend: { sentiment_score: number } } };
    expect(done.analysis.trend.sentiment_score).toBe(0);
    expect(events.at(-1)?.type).toBe("complete");
  });

  it("sums usage across calls", async () => {
    const events = await collect(analyzeCompany("넷록스", news, { llm: fakeLlm() }));
    const complete = events.at(-1) as { result: { usage: { inputTokens: number } } };
    expect(complete.result.usage.inputTokens).toBe(7);
  });

  it("emits error when there is no news", async () => {
    const events = await collect(analyzeCompany("넷록스", [], { llm: fakeLlm() }));
    expect(events[0]).toMatchObject({ type: "error" });
  });
});
```

Run: `npx vitest run src/lib/services/analyzer.test.ts` → FAIL

- [ ] **Step 6: 분석기 구현**

`src/lib/services/analyzer.ts` 요지:
- zod 스키마 3종 + 종합의견 스키마(`{ comprehensive_opinion: string }`)를 정의. 레거시 키 이름(`trend_analysis.sentiment_score` 등) 유지
- 뉴스별로 trend → award → investment 순서로 `llm.json` 호출. 각 호출 실패 시 레거시 `_create_default_news_analysis` 와 같은 기본값(중립 0 / 비수상 / 비투자)으로 대체하고 `progress` 는 계속 낸다
- 기업 단위 동시성은 이 태스크에선 순차(뉴스 1건씩). 50개사 일괄 동시성 상한은 마스터 플랜 리스크 항목대로 후속 태스크에서
- 종합의견: 레거시 L2275~ 의 통계 계산(감성 평균·긍/부정 건수·수상·투자 건수)을 그대로 옮긴 뒤 `opinionPrompt` 호출
- `usage` 누적, `complete` 이벤트에 `runId` 는 Route Handler 가 저장 후 채운다 (서비스는 `runId: 0` 으로 내고 핸들러가 교체)

`src/lib/repositories/analysisRun.ts`: `createRun({companyId,userId,model,news})`, `completeRun(id, result, usage)`, `failRun(id, message)`.

`src/app/api/analyze/route.ts`:
```ts
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { analyzeCompany } from "@/lib/services/analyzer";
import { defaultLlmClient, MODEL } from "@/lib/services/llm";
import { collectNews } from "@/lib/services/newsCollector";
import { createRun, completeRun, failRun } from "@/lib/repositories/analysisRun";
import { z } from "zod";

const bodySchema = z.object({ companyId: z.number().int(), startDate: z.string().optional(), endDate: z.string().optional(), limit: z.number().int().max(100).default(30) });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const body = bodySchema.parse(await request.json());
  const company = await prisma.company.findUniqueOrThrow({ where: { id: body.companyId } });
  const { items } = await collectNews({ query: company.name, startDate: body.startDate, endDate: body.endDate, limit: body.limit });
  const run = await createRun({ companyId: company.id, userId: Number(session.user.id), model: MODEL, news: items });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        for await (const event of analyzeCompany(company.name, items, { llm: defaultLlmClient() })) {
          if (event.type === "complete") {
            await completeRun(run.id, event.result, event.result.usage);
            send({ ...event, runId: run.id });
          } else send(event);
        }
      } catch (err) {
        await failRun(run.id, err instanceof Error ? err.message : "unknown");
        send({ type: "error", message: "분석 중 오류가 발생했습니다." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
```

Run: `npm test` → PASS, `npm run build` → PASS

- [ ] **Step 7: 레거시 대조 기록**

`ANTHROPIC_API_KEY` 가 있는 로컬에서 `npm run dev` 후 기업 1개(넷록스)로 분석 1회 실행. 레거시 `backup/archives/` 의 같은 기업 엑셀에서 뉴스 3건을 골라 감성 점수·수상/투자 판정을 비교해 이 파일 맨 아래 "완료 노트" 에 표로 남긴다. 편차가 있어도 프롬프트는 고치지 않는다 — 기록만 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/services/llm.ts src/lib/services/llm.test.ts src/lib/services/prompts src/lib/services/analyzer.ts src/lib/services/analyzer.test.ts src/lib/repositories/analysisRun.ts src/app/api/analyze package.json package-lock.json docs/superpowers/plans/2026-08-26-phase0-core-loop.md
git commit -m "feat: anthropic analysis engine with SSE streaming"
```

---

### Task 9: 다층 환각 검증기

스킬 `verification-pipeline` 을 먼저 읽는다. 임의 단순화 금지.

**Files:**
- Create: `src/lib/services/verification.ts`, `src/lib/repositories/verificationResult.ts`, `src/app/api/verification/route.ts`
- Modify: `src/app/api/analyze/route.ts` (complete 후 검증을 비동기로 시작하고 `verification` 이벤트 전송)
- Test: `src/lib/services/verification.test.ts`

**Interfaces:**
- Consumes: `AnalysisResult`, `NewsAnalysis` (8), `LlmClient` (8)
- Produces:
```ts
export type VerificationStatus = "verified" | "needs_review";
export type VerificationOutput = {
  status: VerificationStatus;
  faithfulness: number | null;
  sourceCoverage: number;
  evidenceMatch: number;
  unsupportedClaims: string[];
  counterEvidence: string[];
  detail: { layer1: SourceCheck; layer2: JudgeResult | null; layer3: EvidenceMatch; error?: string };
};
export function checkSources(analyses: NewsAnalysis[]): SourceCheck;
export function evidenceMatchScore(claim: string, sourceText: string): number;
export function judgeFaithfulness(result: AnalysisResult, deps: { llm: LlmClient }): Promise<JudgeResult>;
export function decide(scores: { faithfulness: number | null; sourceCoverage: number; evidenceMatch: number }): VerificationStatus;
export function verifyAnalysis(result: AnalysisResult, deps: { llm: LlmClient }): Promise<VerificationOutput>;
```

- [ ] **Step 1: 실패 테스트**

`src/lib/services/verification.test.ts` (판정 경계 7케이스 이상):
```ts
import { describe, it, expect, vi } from "vitest";
import { checkSources, evidenceMatchScore, decide, verifyAnalysis } from "@/lib/services/verification";
import type { AnalysisResult, NewsAnalysis } from "@/lib/services/analyzer";
import type { LlmClient } from "@/lib/services/llm";

function analysis(link: string, summary = "넷록스가 시리즈A 투자를 유치했다"): NewsAnalysis {
  return {
    news: { title: "넷록스 시리즈A 투자 유치", link, description: "넷록스가 시리즈A 투자를 유치했다고 밝혔다", content: "넷록스가 시리즈A 투자를 유치했다고 밝혔다", published: "2025-01-01T00:00:00Z", source: "A", provider: "naver" },
    trend: { news_trend_summary: summary, sentiment_score: 5, sentiment_label: "긍정적" },
    award: { is_award_related: false, award_name: "", award_reason: "" },
    investment: { is_investment_related: true, investment_name: "시리즈A", investment_reason: "r" },
  };
}

function result(analyses: NewsAnalysis[]): AnalysisResult {
  return { companyName: "넷록스", analyses, comprehensiveOpinion: "종합", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
}

describe("layer1 checkSources", () => {
  it("coverage counts valid http links only", () => {
    const r = checkSources([analysis("https://a.kr/1"), analysis("not-a-url"), analysis("")]);
    expect(r.coverage).toBeCloseTo(1 / 3);
    expect(r.invalid).toHaveLength(2);
  });
});

describe("layer3 evidenceMatchScore", () => {
  it("is high when claim words appear in source", () => {
    expect(evidenceMatchScore("넷록스가 시리즈A 투자를 유치했다", "넷록스가 시리즈A 투자를 유치했다고 밝혔다")).toBeGreaterThan(0.6);
  });
  it("is low for unrelated text", () => {
    expect(evidenceMatchScore("삼성전자 반도체 실적 급증", "넷록스가 시리즈A 투자를 유치했다")).toBeLessThan(0.2);
  });
  it("is 0 for empty claim", () => {
    expect(evidenceMatchScore("", "x")).toBe(0);
  });
});

describe("decide", () => {
  const cases: [number | null, number, number, string][] = [
    [0.85, 0.5, 0.4, "verified"],
    [0.849, 0.5, 0.4, "needs_review"],
    [0.85, 0.49, 0.4, "needs_review"],
    [0.85, 0.5, 0.39, "needs_review"],
    [1, 1, 1, "verified"],
    [null, 1, 1, "needs_review"],
    [0, 0, 0, "needs_review"],
  ];
  it.each(cases)("f=%s c=%s e=%s → %s", (f, c, e, expected) => {
    expect(decide({ faithfulness: f, sourceCoverage: c, evidenceMatch: e })).toBe(expected);
  });
});

describe("verifyAnalysis", () => {
  const goodJudge: LlmClient = {
    json: vi.fn(async () => ({
      data: { claims: [{ claim: "넷록스가 시리즈A 투자를 유치했다", supported: true, evidence: "…" }], counter_evidence: ["단일 출처에 의존"] },
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
    })),
  };

  it("verifies when all layers pass", async () => {
    const out = await verifyAnalysis(result([analysis("https://a.kr/1")]), { llm: goodJudge });
    expect(out.status).toBe("verified");
    expect(out.counterEvidence).toEqual(["단일 출처에 의존"]);
  });

  it("is needs_review when the judge throws", async () => {
    const llm: LlmClient = { json: vi.fn(async () => { throw new Error("timeout"); }) };
    const out = await verifyAnalysis(result([analysis("https://a.kr/1")]), { llm });
    expect(out.status).toBe("needs_review");
    expect(out.faithfulness).toBeNull();
    expect(out.detail.error).toMatch(/timeout/);
  });

  it("is needs_review when sources are missing even if judge passes", async () => {
    const out = await verifyAnalysis(result([analysis("https://a.kr/1"), analysis(""), analysis("")]), { llm: goodJudge });
    expect(out.status).toBe("needs_review");
  });
});
```

Run: `npx vitest run src/lib/services/verification.test.ts` → FAIL

- [ ] **Step 2: 구현**

`src/lib/services/verification.ts` 요지:
- **층1** `checkSources`: `new URL(link)` 성공 + `http(s):` 프로토콜인 항목 비율 = `coverage`. 실패 목록 `invalid`
- **층3** `evidenceMatchScore`: 공백·구두점 제거 후 문자 bigram Dice 계수(Task 7 `titleSimilarity` 와 동일 공식 — 재사용하려면 `src/lib/services/textSimilarity.ts` 로 빼서 둘 다 import). 뉴스별로 `trend.news_trend_summary` vs `news.title + news.content` 를 계산해 평균 (본문이 있어야 의미 있는 신호다 — Task 7 의 크롤링이 층③의 전제)
- **층2+4** `judgeFaithfulness`: 시스템 프롬프트 "당신은 사실 검증 심사관입니다…", 사용자 프롬프트에 뉴스 원문(제목·설명·출처·링크)과 분석 결과(요약·감성·수상·투자)를 나열하고, 구조화 출력 스키마
  ```ts
  z.object({
    claims: z.array(z.object({ claim: z.string(), supported: z.boolean(), evidence: z.string() })),
    counter_evidence: z.array(z.string()).describe("이 평가가 틀릴 수 있는 이유"),
  })
  ```
  `faithfulness = supported 수 / claims 수` (claims 가 0 이면 0). `effort: "low"`. 반증 문장은 그대로 `counterEvidence`
- `decide`: `faithfulness !== null && faithfulness >= 0.85 && coverage >= 0.5 && evidenceMatch >= 0.4 ? "verified" : "needs_review"`
- `verifyAnalysis`: 층1·3 은 항상 계산. 층2 는 `try/catch` — 실패 시 `faithfulness: null`, `detail.error` 기록, 그리고 **어떤 경우에도 기본값은 `needs_review`**. `catch` 에서 `verified` 를 만들 수 있는 경로가 없어야 한다

`src/lib/repositories/verificationResult.ts`: `saveVerification(runId, output)` — `unsupportedClaims`·`counterEvidence`·`detail` 은 JSON 문자열로.

`src/app/api/analyze/route.ts` 수정: `complete` 전송 후 `verifyAnalysis` 를 실행해 `{ type: "verification", status, scores }` 이벤트를 추가로 보내고 저장한다. 검증이 던져도 `complete` 는 이미 나갔으므로 리포트 흐름은 깨지지 않는다 — 스킬의 "비동기 지점" 규칙.

`src/app/api/verification/route.ts`: `GET ?runId=` → 저장된 결과 반환, `POST {runId}` → 재검증.

Run: `npm test` → PASS, `npm run build` → PASS

- [ ] **Step 3: 임계값 기록**

로컬에서 Task 8 Step 7 의 실행 결과 1건을 재검증해 `faithfulness / coverage / evidenceMatch` 값과 판정을 완료 노트에 기록한다. 임계값(0.85/0.5/0.4)은 이 태스크에서 바꾸지 않는다.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/services/verification.ts src/lib/services/verification.test.ts src/lib/services/textSimilarity.ts src/lib/services/newsCollector.ts src/lib/repositories/verificationResult.ts src/app/api/verification src/app/api/analyze/route.ts docs/superpowers/plans/2026-08-26-phase0-core-loop.md
git commit -m "feat: multi-layer hallucination verification"
```

---

## Self-Review 결과 (작성 시점)

- **스펙 커버리지**: 마스터 플랜 Task 2(3분할)·7·8·9 전부 대응. Task 10(엑셀)은 다음 실행 플랜
- **Placeholder**: 2b Step 2 의 `REPLACE_WITH_HEX_FROM_STEP_3` 는 실측값을 넣으라는 의도된 자리다 — Step 3 에서 반드시 채운다. 그 외 TBD 없음
- **타입 일관성**: `NewsItem`(7) → `NewsAnalysis.news`(8) → `checkSources`(9); `LlmClient.json`(8) 을 8·9 가 동일 시그니처로 사용; `AnalysisRun.formulaVersion` 기본 `v2-anthropic`(2a) 과 마스터 플랜 일치
- **미확정 API 표면**: `output_config.format` 키 형식, next-auth v5 의 proxy 내 `auth()` 호출, Prisma 7 `prisma.config.ts` — 세 곳 모두 "설치본 문서를 읽고 맞춘다" 단계를 두었다. 추측으로 쓰지 않는다

## 완료 노트

(Task 8 Step 7, Task 9 Step 3 에서 채운다)
