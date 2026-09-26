# 기사 판정(06 판정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **실행 방식:** 사용자가 "추천안대로 끝까지 개발"을 지시했다(2026-09-26) — executing-plans 로 이 세션에서 인라인 실행한다. 작업 브랜치는 main.

**Goal:** 사람 정답셋 검토 화면을 앱의 06 판정 탭으로 들이고, 판정을 다음 분석에 반영하며, 분석기 보류 기사가 자동으로 대기열에 오게 한다.

**Architecture:** `ArticleJudgment` 한 테이블((companyId, link) 유일)이 게이트·보류·수동 대기열과 판정 결과를 모두 담는다. 파이프라인은 분석 전에 `about=no` 링크를 빼고 `about=yes` 링크를 강제 주제로 넘기며, 분석 뒤 보류 기사를 적재한다. 화면은 서버 컴포넌트가 목록을 읽고 클라이언트 워크벤치가 서버 액션으로 판정을 저장한다 — 모델 답은 판정 전 클라이언트로 보내지 않는다.

**Tech Stack:** Next.js 16.3.3(App Router·Server Actions) · Prisma 7 + SQLite · zod 4 · Vitest 4 + Testing Library · shadcn/ui + Tailwind v4(방향 B「신호」)

**Spec:** `docs/superpowers/specs/2026-09-26-article-judgments-design.md`

## Global Constraints

- 주석은 함수 JSDoc 만, 본문 3줄 이내. 줄 주석(`//`) 금지. 외부 API 테스트는 전부 mock
- 사용자 미커밋 변경(`env.ts`·`envAccount.ts`·`authenticate.ts`·`.env.example`·`deploy/README.md`·`instrumentation-node.ts` 등)을 커밋에 섞지 않는다 — 겹치면 HEAD 에 내 변경분만 얹어 스테이징
- 반영은 `about` 만 본다: `no` → 분석 전 제외, `yes` → 다시 수집되면 강제 주제, `unsure`/null → 영향 없음
- 보류 = `!isAboutCompany && about_confidence ≥ 0.3`(HOLD_FLOOR) — 두 분석기 공통
- 모델 답은 `about` 이 저장되기 전에는 클라이언트 페이로드에도 싣지 않는다
- 게이트 묶음 키는 `jev-gate-2026-09`
- 디자인: 사각·그림자 없음·`signal` 변형·상태색(verified·review·risk·pending)은 판정 의미에만, 숫자 열 `tabular-nums`

## Review Focus

1. 이미 판정한 기사가 보류·게이트·수동으로 다시 올라와도 사람 판정이 지워지지 않아야 한다 → T1 `enqueueJudgments` 테스트
2. 메모 입력 중에 Y·N·1·Q 같은 키를 쳐도 판정이 바뀌면 안 된다 → T7 워크벤치 테스트
3. 배치가 이미 돌 때 '반영 재분석'을 누르면 409 메시지를 보여 주고 아무것도 바꾸지 않아야 한다 → T7 워크벤치 테스트
4. 판정을 yes→no 로 바꾸거나 unsure 로 되돌리면 반영 대기 여부가 따라 바뀌어야 한다(unsure·null 은 반영 대기가 아니다) → T1 `listReflectPending` 테스트
5. 제외(비활성) 기업의 판정은 대기 수·반영 대기·목록에 나오지 않아야 한다 → T1 테스트

---

## 파일 구조

```
prisma/schema.prisma · migrations/<ts>_article_judgment      T1  ArticleJudgment + Company.judgments
src/lib/repositories/articleJudgment.ts (+test)               T1  적재·저장·반영 규칙·대기 수·반영 대기·목록·게이트 라벨
src/lib/test-support/db.ts                                    T1  resetDatabase 에 articleJudgment
src/lib/services/judgments.ts (+test)                         T2  문항 정의·zod·판정 적용·보류 적재 행·모델 답 문구·하이라이트·게이트 행
src/lib/services/analyzer.ts (+test)                          T3  HOLD_FLOOR·isHeld 이동, forceAbout, LLM held
src/lib/services/jevAnalyzer.ts (+test)                       T3  forceAbout, isHeld 사용
src/lib/services/analysisPipeline.ts (+test)                  T4  loadJudgments·enqueueHeld, 기본 deps 연결
scripts/import-judgment-gate.ts · scripts/eval-jev-gate.ts    T5  게이트 표본 가져오기, 채점이 DB 에서 읽기
src/app/(app)/judgments/actions.ts (+test)                    T6  saveJudgmentAction·queueArticleAction
src/app/(app)/judgments/page.tsx                              T7  서버 컴포넌트
src/components/judgments/*.tsx (+test)                        T7  워크벤치(목록·기사·판정 패널·계기·반영 재분석)
src/components/layout/side-tabs.tsx · app-shell.test.tsx      T8  06 판정 탭
src/lib/services/freshness.ts (+test) · dashboard/page.tsx    T8  리본 "기사 판정 N건"
src/app/(app)/companies/[id]/page.tsx · components/company/article-list.tsx (+test)  T8  기업 상세 기사 목록 + 올리기
CLAUDE.md · docs/superpowers/plans/2026-09-25-next-session.md T9  문서
```

---

### Task 1: ArticleJudgment 스키마와 저장소

**Files:**
- Modify: `prisma/schema.prisma`(Company 에 `judgments ArticleJudgment[]`, 모델 추가) · Create: `prisma/migrations/20260926010000_article_judgment/migration.sql`
- Create: `src/lib/repositories/articleJudgment.ts`, `src/lib/repositories/articleJudgment.test.ts`
- Modify: `src/lib/test-support/db.ts`

**Interfaces — Produces:**

```ts
export type JudgmentOrigin = "held" | "gate" | "manual";
export type JudgmentAnswer = { entity: string | null; role: string | null; form: string | null; about: string | null; note: string | null };
export type EnqueueInput = {
  companyId: number; link: string; title: string; source: string; published: string; body: string;
  origin: JudgmentOrigin; model: Record<string, unknown>; setKey?: string | null; stratum?: string | null; required?: boolean;
};
export type JudgmentRow = JudgmentAnswer & {
  id: number; companyId: number; link: string; title: string; source: string; published: string; body: string;
  origin: JudgmentOrigin; setKey: string | null; stratum: string | null; required: boolean; modelJson: string;
  judgedAt: Date | null; queuedAt: Date;
  company: { name: string; officialName: string | null; industry: string | null; ceoName: string | null; aliases: string[] };
};
export async function enqueueJudgments(rows: EnqueueInput[], now?: Date): Promise<number>;   // 새로 만든 행 수. 기존 (companyId, link) 는 건드리지 않는다
export async function saveJudgment(id: number, patch: Partial<JudgmentAnswer>, userId: number, now?: Date): Promise<JudgmentRow>;
export async function judgmentOverrides(companyId: number): Promise<{ exclude: string[]; include: string[] }>;
export async function countPendingJudgments(): Promise<number>;                              // about null · 활성 기업
export async function listReflectPending(): Promise<Array<{ companyId: number; name: string; judged: number }>>;
export async function listJudgments(): Promise<JudgmentRow[]>;                               // 활성 기업 · 필수 게이트 → 나머지, 각 queuedAt·id 순
export async function findJudgmentsByLink(companyId: number): Promise<Map<string, { id: number; about: string | null }>>;
export async function listGateLabels(setKey: string): Promise<Array<{ companyId: number; link: string; about: string | null; stratum: string | null }>>;
```

- [ ] **Step 1: 스키마·마이그레이션**

```prisma
model ArticleJudgment {
  id        Int       @id @default(autoincrement())
  companyId Int
  company   Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  link      String
  title     String
  source    String    @default("")
  published String    @default("")
  body      String    @default("")
  origin    String
  setKey    String?
  stratum   String?
  required  Boolean   @default(false)
  modelJson String    @default("{}")
  entity    String?
  role      String?
  form      String?
  about     String?
  note      String?
  judgedAt  DateTime?
  judgedBy  Int?
  queuedAt  DateTime  @default(now())

  @@unique([companyId, link])
  @@index([about])
}
```

`npx prisma migrate diff --from-schema <HEAD 스키마> --to-schema prisma/schema.prisma --script` 로 SQL 을 만들고, `DATABASE_URL=file:./prisma/test.db npx prisma migrate deploy` · `npx prisma generate`.

- [ ] **Step 2: 실패 테스트** — `articleJudgment.test.ts`(test.db, `beforeEach(resetDatabase)`)
  - 적재는 멱등이다: 같은 (companyId, link) 두 번 → 1 반환 후 0, 행 1개
  - **이미 판정한 기사를 다시 올려도 판정·출처가 그대로다**(Review Focus 1): `saveJudgment(about:"no")` 뒤 `enqueueJudgments(origin:"manual")` → about "no", origin 처음 값
  - `saveJudgment` 는 준 필드만 바꾼다: about 저장 뒤 note 만 저장 → about 유지. about 을 값으로 두면 judgedAt·judgedBy 기록, null 로 되돌리면 judgedAt null
  - `judgmentOverrides`: no→exclude, yes→include, unsure·null→어디에도 없음
  - `listReflectPending`(Review Focus 4): 판정(yes) 시각이 마지막 끝낸 분석(completed·no_news)보다 늦으면 포함 · 이르면 제외 · 수집만 한(collected)·실패 실행은 무시 · 끝낸 분석이 없으면 포함 · unsure/null 은 제외
  - 비활성 기업의 행은 `countPendingJudgments`·`listReflectPending`·`listJudgments` 에 없다(Review Focus 5)
  - `listJudgments` 순서: 필수 게이트 먼저, 그 안에서 queuedAt·id 순. company.aliases 는 배열
  - `listGateLabels(setKey)` 는 그 묶음의 행만

- [ ] **Step 3: 실행해 실패 확인** — `npx vitest run src/lib/repositories/articleJudgment.test.ts` → import 실패

- [ ] **Step 4: 구현** — 적재는 `findUnique` 로 있는지 보고 없을 때만 `create`(SQLite 에는 skipDuplicates 가 없다). 반영 대기는 활성 기업의 판정(about in yes·no, judgedAt not null)과 기업별 마지막 끝낸 실행 `createdAt` 을 비교한다:

```ts
const judged = await prisma.articleJudgment.findMany({
  where: { about: { in: ["yes", "no"] }, judgedAt: { not: null }, company: { isActive: true } },
  select: { companyId: true, judgedAt: true, company: { select: { name: true, analysisRuns: { where: { status: { in: ["completed", "no_news"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } } },
});
```

- [ ] **Step 5: 통과 확인 후 커밋** — `feat(judgments): 기사 판정 테이블과 저장소 — 적재는 멱등이고 사람 판정을 덮지 않는다`

### Task 2: 판정 서비스(순수 함수)

**Files:** Create `src/lib/services/judgments.ts`, `src/lib/services/judgments.test.ts`

**Interfaces — Consumes:** T1 `EnqueueInput`, `NewsAnalysis`·`NewsItem`. **Produces:**

```ts
export const GATE_SET_KEY = "jev-gate-2026-09";
export const JUDGMENT_QUESTIONS: Record<"entity" | "role" | "form" | "about", Array<{ value: string; label: string; hint?: string; key: string }>>;
export const judgmentPatchSchema: z.ZodType<Partial<JudgmentAnswer>>;       // 값은 문항 value 또는 null, note 는 2000자 이하
export function applyJudgments(news: NewsItem[], overrides: { exclude: string[]; include: string[] }): { news: NewsItem[]; forceAbout: Set<string> };
export function heldEnqueueRows(input: { companyId: number; runId: number; formulaVersion: string; analyses: NewsAnalysis[] }): EnqueueInput[];
export function manualEnqueueRow(input: { companyId: number; runId: number; formulaVersion: string; analysis: NewsAnalysis }): EnqueueInput;
export function modelVerdict(modelJson: string): string;                    // "분석기: 주제 아님 · 확신 0.45 · LLM · 실행 #312" / 게이트: "Sonnet: 주제(0.9) · Jev 1차 0.22"
export function highlightSegments(text: string, names: string[]): Array<{ text: string; mark: boolean }>;
export function gateEnqueueRows(items: GateItem[], keys: GateKey[]): EnqueueInput[];
```

문항 값: entity `same|other|unclear`(키 1·2·3), role `main|party|many|passing`(Q·W·E·R), form `single|roundup|market|broken`(A·S·D·F), about `yes|no|unsure`(Y·N·U) — 라벨·힌트는 아티팩트와 같다.

- [ ] **Step 1: 실패 테스트**
  - `applyJudgments`: exclude 링크는 빠지고, include 링크는 relevance 가 mention 이어도 primary 로 바뀌며 forceAbout 에 든다. 목록에 없는 include 는 무시
  - `heldEnqueueRows`: `held === true` 인 분석만, 본문·출처 스냅샷과 model `{ analyzer: "llm"|"jev", formulaVersion, runId, isAbout: false, confidence }` 를 싣는다(v3-jev → "jev")
  - `modelVerdict`: 주제/주제 아님/보류 문구, 확신도 소수 둘째 자리, 게이트 model 은 Sonnet·Jev 1차 답을 적는다. 깨진 JSON 은 "분석기 답이 기록되지 않았습니다"
  - `highlightSegments`: 회사명·별칭(공백 무시, 3자 이상은 글자 사이 공백 허용)을 mark 로 가르고 나머지는 그대로 이어 붙이면 원문과 같다
  - `judgmentPatchSchema`: 모르는 값·필드는 거부, null 은 허용
  - `gateEnqueueRows`: 층·필수·Sonnet/Jev 1차 답이 들어가고 origin gate·setKey GATE_SET_KEY

- [ ] **Step 2~4:** 실패 확인 → 구현 → 통과
- [ ] **Step 5: 커밋** — `feat(judgments): 판정 문항·반영 적용·보류 적재 행·모델 답 문구를 순수 함수로 둔다`

### Task 3: 분석기 — 강제 주제와 LLM 보류

**Files:** Modify `src/lib/services/analyzer.ts`(+test), `src/lib/services/jevAnalyzer.ts`(+test)

**Interfaces — Produces:**

```ts
// analyzer.ts
export const HOLD_FLOOR = 0.3;                                        // jevAnalyzer 에서 옮긴다
export function isHeld(trend: Trend, about: boolean): boolean;       // !about && about_confidence !== undefined && about_confidence >= HOLD_FLOOR
type Deps = { llm; model?; concurrency?; facts?; profile?; forceAbout?: ReadonlySet<string> };
// jevAnalyzer.ts
export function interpretAnswers(item, context, answers, forced?: boolean): NewsAnalysis;
type Deps = { ...; forceAbout?: ReadonlySet<string> };
```

- [ ] **Step 1: 실패 테스트**
  - LLM: 확신도 0.5 로 Y → `isAboutCompany` false·`held` true / 0.2 → held 없음 / N 인데 0.8(모순) → held true / 0.9 Y → held 없음
  - LLM: `forceAbout` 에 든 링크는 N·0.1 이어도 주제이고 held 가 아니며 stats.scoredNews 에 센다
  - Jev: `interpretAnswers(..., true)` 는 확신도 0.1 이어도 주제·held false. `analyzeCompanyWithJev` 가 forceAbout 을 기사별로 넘긴다
- [ ] **Step 2~4:** 실패 확인 → 구현(LLM 분석 행은 held 일 때만 `held: true` 를 싣는다 — 기존 스냅샷 모양 유지) → 통과
- [ ] **Step 5: 커밋** — `feat(analyzer): 사람 판정으로 주제를 강제하고, LLM 분석기도 회색지대를 보류로 표시한다`

### Task 4: 파이프라인 — 판정 적용과 보류 적재

**Files:** Modify `src/lib/services/analysisPipeline.ts`(+test)

**Interfaces — Consumes:** T1 `judgmentOverrides`·`enqueueJudgments`, T2 `applyJudgments`·`heldEnqueueRows`, T3 `forceAbout`. **Produces:**

```ts
export type PipelineDeps = {
  ...;
  analyze: (name: string, news: NewsItem[], deps: { model: string; facts?: string[]; profile?: CompanyProfile; forceAbout?: ReadonlySet<string> }) => AsyncGenerator<AnalyzeEvent>;
  loadJudgments?: (companyId: number) => Promise<{ exclude: string[]; include: string[] }>;
  enqueueHeld?: (rows: EnqueueInput[]) => Promise<unknown>;
};
```

- [ ] **Step 1: 실패 테스트**
  - `about=no` 링크는 analyze 에 넘어가지 않는다 / include 링크는 relevance mention 이어도 넘어가고 forceAbout 에 든다
  - 전부 제외되면 no_news 로 끝난다
  - 분석이 끝나면 held 분석이 `enqueueHeld` 로 간다(runId·formulaVersion 포함) — scoredNews 0 이어도 간다
  - `loadJudgments`·`enqueueHeld` 가 던져도 분석·검증은 계속된다(로그만)
- [ ] **Step 2~4:** 실패 확인 → 구현(`defaultPipelineDeps` 에 `loadJudgments: judgmentOverrides`, `enqueueHeld: enqueueJudgments`) → 통과
- [ ] **Step 5: 커밋** — `feat(pipeline): 사람 판정을 분석 전에 적용하고, 보류 기사를 판정 대기열에 올린다`

### Task 5: 게이트 표본 가져오기와 채점의 DB 전환

**Files:** Create `scripts/import-judgment-gate.ts` · Modify `scripts/eval-jev-gate.ts` · (T2 `gateEnqueueRows` 가 매핑을 맡고 테스트를 가진다)

- [ ] **Step 1:** `import-judgment-gate.ts` — `review-items.json`·`review-key.json` 을 읽어 `gateEnqueueRows` → `enqueueJudgments`. 기업이 없으면 건너뛰고 수를 알린다. 다시 돌려도 0건
- [ ] **Step 2:** `eval-jev-gate.ts` — `human-labels.json` 대신 `listGateLabels(GATE_SET_KEY)` 를 (companyId, link) 로 조인한다. 층 모집단 크기는 `review-key.json` 그대로
- [ ] **Step 3:** 실제 DB 로 가져오기 실행 → 83건, 재실행 0건 · `npx tsx scripts/eval-jev-gate.ts --score-only` 가 "판정 0/83 · 필수 0/53" 을 낸다
- [ ] **Step 4: 커밋** — `feat(jev): 게이트 표본을 판정 대기열로 들이고, 채점은 DB 판정을 읽는다`

### Task 6: 서버 액션

**Files:** Create `src/app/(app)/judgments/actions.ts`, `src/app/(app)/judgments/actions.test.ts`

**Interfaces — Produces:**

```ts
export type JudgmentView = { id: number; companyId: number; companyName: string; officialName: string | null; industry: string | null; ceoName: string | null; aliases: string[];
  title: string; source: string; published: string; link: string; body: string; origin: JudgmentOrigin; required: boolean; stratum: string | null;
  answer: JudgmentAnswer; judged: boolean; verdict: string | null };   // verdict 는 about 이 있을 때만
export function toJudgmentView(row: JudgmentRow): JudgmentView;        // services/judgments.ts 에 둔다 — 페이지와 액션이 같이 쓴다
export async function saveJudgmentAction(input: { id: number } & Partial<JudgmentAnswer>): Promise<{ ok: true; judgment: JudgmentView } | { ok: false; message: string }>;
export async function queueArticleAction(input: { companyId: number; runId: number; link: string }): Promise<{ ok: true; id: number } | { ok: false; message: string }>;
```

- [ ] **Step 1: 실패 테스트**(auth mock + test.db) — 비로그인 거부 · 모르는 값 거부 · about 저장 뒤 verdict 가 생긴다(판정 전 null) · queue 는 그 실행의 분석을 스냅샷으로 올리고 이미 있으면 기존 id · 없는 실행/링크는 거부
- [ ] **Step 2~4:** 실패 확인 → 구현(`revalidatePath("/judgments")`·기업 상세) → 통과
- [ ] **Step 5: 커밋** — `feat(judgments): 판정 저장·기사 올리기 서버 액션`

### Task 7: 06 판정 화면

**Files:** Create `src/app/(app)/judgments/page.tsx`, `src/components/judgments/judgment-workbench.tsx`(+test), `judgment-article.tsx`, `judgment-panel.tsx`

- 페이지: `listJudgments()` → `toJudgmentView`, `listReflectPending()`, 게이트 진행(필수 판정 수/필수 수). `Panel` 머리에 계기(미판정·게이트 필수·반영 대기)와 '반영 재분석'
- 워크벤치: 상태 거르기(미판정·판정 완료·전체) + 경로 거르기(전체·보류·게이트·수동), 목록 | 기사 | 패널 3단(`lg:grid-cols-[200px_minmax(0,1fr)_240px]`), 좁으면 select
- 키보드: 문항 키·K/J·Enter. **textarea·input·select 에 포커스가 있으면 무시**
- 저장: 누르면 낙관 갱신 → `saveJudgmentAction` → 응답으로 교체(verdict 공개). 실패하면 되돌리고 메시지
- 메모: 입력 멈추고 600ms 뒤 저장
- 반영 재분석: `fetch("/api/analyze/batch", { method: "POST", body: { companyIds, stage: "full", force: true } })` → 202 "재분석을 시작했습니다 — 진행은 헤더에서" · 그 외 서버 메시지 그대로

- [ ] **Step 1: 실패 테스트** — 판정 전 모델 답이 안 보이고 about 저장 뒤 보인다 · Y 키가 about=yes 저장을 부른다 · **메모에 "y" 를 쳐도 저장이 불리지 않는다**(Review Focus 2) · "미판정" 거르기 · Enter 가 다음 미판정으로 · 본문이 비면 "본문이 수집되지 않았습니다" · **반영 재분석 409 → 서버 메시지 표시**(Review Focus 3) · 대기열이 비면 빈 상태 문구
- [ ] **Step 2~4:** 실패 확인 → 구현 → 통과
- [ ] **Step 5: 커밋** — `feat(judgments): 06 판정 화면 — 목록·기사·판정 패널·키보드, 모델 답은 판정 뒤에 연다`

### Task 8: 탭·대시보드 리본·기업 상세 기사 목록

**Files:** Modify `side-tabs.tsx`·`app-shell.test.tsx` · `freshness.ts`(+test)·`dashboard/page.tsx` · `companies/[id]/page.tsx` · Create `src/components/company/article-list.tsx`(+test)

- 탭: `{ href: "/judgments", index: "06", label: "판정" }` — 링크 6개
- 리본 `RibbonInput` 에 `pendingJudgments`·`reflectPending` → "기사 판정 N건"(+ " · 반영 대기 M개사") `href: "/judgments"`
- 기업 상세 `Panel index="03" title="기사"` — 마지막 끝낸 분석의 기사: 제목(원문 링크)·출처·날짜, 분석기 판정(주제·주제 아님·보류 + 확신도), 사람 판정(미판정·주제·주제 아님·모름), '판정 대기열에 올리기'(이미 있으면 "대기열에 있음" 링크)

- [ ] **Step 1: 실패 테스트** — 탭 6개·06 판정 href · 리본 문구와 href · 기사 목록 행·버튼이 `queueArticleAction` 을 부른다·이미 있으면 버튼 대신 링크
- [ ] **Step 2~4:** 실패 확인 → 구현 → 통과
- [ ] **Step 5: 커밋** — `feat(judgments): 06 판정 탭·대시보드 판정 건수·기업 상세 기사 목록에서 대기열에 올리기`

### Task 9: 문서

- [ ] CLAUDE.md 프로젝트 단락에 06 판정·반영 규칙 한 줄, 인계 문서(게이트 판정 경로가 앱으로 바뀜, 검증 시간 실측)
- [ ] 커밋: `docs: 기사 판정 기능과 검증 시간 실측을 문서에 반영한다`
