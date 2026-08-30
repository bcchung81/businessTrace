# 기업 상세 "확인 필요" 블록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기업 상세 헤더 아래 절 `00 확인 필요` 하나에서 사람이 정해야 열리는 다섯 가지를 처리한다 — 동명 충돌 후보 선택(국민연금·DART), 검증 검토 기록, 미확인 경보·주의 사건 확인, 검색 별칭, 사업자번호 입력. 정리되면 블록은 "없음" 한 줄로 준다.

**Architecture:** 결정은 `SourceDecision`(기업×원천 1행)에, 검토는 `VerificationResult.reviewedAt/By/Note` 에, 사건 확인은 기존 `reviewEvent` 에, 별칭·사업자번호는 `Company` 에 저장한다. `collectEvidence` 가 결정을 읽어 재조회 시 후보를 고정하고, 뉴스 수집은 별칭까지 합쳐 질의한다. 조립은 `reviewItems.ts` 가, 저장은 Server Action 6개가, 화면은 `review-block.tsx` 가 맡는다.

**Tech Stack:** Prisma(마이그레이션 1) · Server Actions · vitest + Testing Library

**Spec:** 캔버스 "현행 화면" 페이지(CompanyDetailReview·Clean·NoBizno, 승인 2026-08-30) · 브리프 §2-D·E·I·K · `docs/2026-08-30-api-response-fields.md`

## Global Constraints

- 항목은 해당할 때만 나타난다. 다섯 항목 전부 없으면 `확인 필요 · 없음` 한 줄 + 마지막 정리 시각·사용자
- 항목마다 primary 버튼 하나. 라벨: `이 사업장으로 확정` · `보류` / `이 기업이 맞다` · `아니다 — DART 미등록으로 확정` / `검토 완료로 기록` / `선택 {n}건 확인` · `모두 확인` / `저장 후 수집만 재실행` / `저장 후 원천 대조`
- 미확인 사건 항목은 `severity ∈ {alert, notice}` 이고 `status = open` 인 것만. 긍정·정보 사건은 두지 않는다
- 국민연금 후보 카드는 `businessNoPrefix` 가 등록 사업자번호 앞 6자리와 같으면 `등록 번호 일치` 로 강조한다. 그 밖의 교차 일치 계산은 하지 않는다(원천 응답에 주소·대표 비교 근거가 부족하다 — 시안의 "2 원천 일치"는 여기서는 `등록 번호 일치` 하나로 줄인다)
- DART "아니다" 는 `SourceDecision{source:"dart", value:"none"}` 로 저장하고 이후 조회에서 DART 를 `absent`(요약 "운영자가 DART 미등록으로 확정") 로 낸다
- 결정 저장 = 바로 원천 재조회(단건 `/api/companies/[id]/dart` 와 같은 순서). 별칭 저장 = 수집만 재실행은 **링크**로 일괄 실행 패널을 연다(`/companies?run={id}&stage=news`) — 상세에서 LLM 을 돌리지 않는다
- 주석은 JSDoc 만. 외부 호출은 mock. 사각 문법(그림자·둥근 모서리 없음)

---

### Task 1: 스키마와 결정 리포지토리

**Files:** Modify `prisma/schema.prisma` · Create `src/lib/repositories/sourceDecision.ts` · Test `src/lib/repositories/sourceDecision.test.ts`

스키마 추가:
```prisma
model SourceDecision {
  id        Int      @id @default(autoincrement())
  companyId Int
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  source    String
  value     String
  label     String?
  decidedAt DateTime @default(now())
  decidedBy Int
  @@unique([companyId, source])
}
```
`Company` 에 `aliases String?`(JSON 배열) 과 `sourceDecisions SourceDecision[]`, `VerificationResult` 에 `reviewedAt DateTime?` `reviewedBy Int?` `reviewNote String?`. 마이그레이션 이름 `review_block`: `npx prisma migrate dev --name review_block` (테스트 DB 는 `resetDatabase` 가 `prisma db push` 를 쓰는지 `src/lib/test-support/db.ts` 로 확인하고 그대로 따른다).

**Interfaces:**
```ts
export type SourceDecisionRow = { source: "nps" | "dart"; value: string; label: string | null; decidedAt: string };
export async function saveSourceDecision(input: { companyId: number; source: "nps" | "dart"; value: string; label?: string | null; userId: number }): Promise<SourceDecisionRow>;
export async function listSourceDecisions(companyId: number): Promise<SourceDecisionRow[]>;
export async function clearSourceDecision(companyId: number, source: "nps" | "dart"): Promise<void>;
```

- [ ] **Step 1: Failing test**
```ts
// src/lib/repositories/sourceDecision.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { clearSourceDecision, listSourceDecisions, saveSourceDecision } from "@/lib/repositories/sourceDecision";

describe("sourceDecision", () => {
  beforeEach(resetDatabase);

  test("keeps one decision per company and source, overwriting on repeat", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    await saveSourceDecision({ companyId: company.id, source: "nps", value: "625870", label: "㈜가 · 서울", userId: 1 });
    await saveSourceDecision({ companyId: company.id, source: "nps", value: "625871", userId: 1 });
    await saveSourceDecision({ companyId: company.id, source: "dart", value: "none", userId: 1 });
    const rows = await listSourceDecisions(company.id);
    expect(rows.map((r) => [r.source, r.value, r.label])).toEqual([["dart", "none", null], ["nps", "625871", null]]);
    await clearSourceDecision(company.id, "dart");
    expect((await listSourceDecisions(company.id)).map((r) => r.source)).toEqual(["nps"]);
  });
});
```
- [ ] **Step 2: Run → fails** (schema/module missing)
- [ ] **Step 3: Implement** — schema 위 그대로, 마이그레이션, 리포지토리:
```ts
// src/lib/repositories/sourceDecision.ts
import { prisma } from "@/lib/db";

export type DecisionSource = "nps" | "dart";
export type SourceDecisionRow = { source: DecisionSource; value: string; label: string | null; decidedAt: string };

/**
 * 동명 충돌을 사람이 고른 결과를 기업×원천 한 줄로 둔다. 다시 고르면 덮어쓴다.
 */
export async function saveSourceDecision(input: { companyId: number; source: DecisionSource; value: string; label?: string | null; userId: number }): Promise<SourceDecisionRow> {
  const row = await prisma.sourceDecision.upsert({
    where: { companyId_source: { companyId: input.companyId, source: input.source } },
    create: { companyId: input.companyId, source: input.source, value: input.value, label: input.label ?? null, decidedBy: input.userId },
    update: { value: input.value, label: input.label ?? null, decidedBy: input.userId, decidedAt: new Date() },
  });
  return { source: row.source as DecisionSource, value: row.value, label: row.label, decidedAt: row.decidedAt.toISOString() };
}

export async function listSourceDecisions(companyId: number): Promise<SourceDecisionRow[]> {
  const rows = await prisma.sourceDecision.findMany({ where: { companyId }, orderBy: { source: "asc" } });
  return rows.map((row) => ({ source: row.source as DecisionSource, value: row.value, label: row.label, decidedAt: row.decidedAt.toISOString() }));
}

export async function clearSourceDecision(companyId: number, source: DecisionSource): Promise<void> {
  await prisma.sourceDecision.deleteMany({ where: { companyId, source } });
}
```
- [ ] **Step 4: Run → pass** · `npx vitest run` 전체도 통과해야 한다(스키마 변경이 기존 테스트를 깨지 않는지)
- [ ] **Step 5: Commit** `feat(review): source decisions, aliases and verification review columns`

---

### Task 2: 결정을 재조회에 반영

**Files:** Modify `src/lib/services/dart.ts`(getCompanyProfile 에 `hints`), `src/lib/services/collectEvidence.ts`, `src/lib/services/sourceEvidence.ts`(dart "none" 요약), `src/app/api/companies/[id]/dart/route.ts`, `src/app/api/analyze/batch/route.ts` · Tests `src/lib/services/collectEvidence.test.ts`(케이스 추가), `src/lib/services/dart.test.ts`(케이스 추가)

**Interfaces:**
```ts
// dart.ts
export async function getCompanyProfile(companyName: string, deps: DartDeps = {}, hints: { corpCode?: string } = {}): Promise<CompanyProfile>;
// hints.corpCode 가 있으면 resolveCorp 를 건너뛰고 그 코드로 company.json 을 부른다 (후보 목록에서 corpName 을 찾아 채운다)
// collectEvidence.ts
export type Decisions = { dart?: string; nps?: string };   // dart: corpCode 또는 "none"
export async function collectEvidence(company: { name: string; year: number; businessNo?: string | null }, deps?: Collectors, decisions: Decisions = {}): Promise<CollectedEvidence>;
```
`collectEvidence` 규칙: `decisions.dart === "none"` → `profile = { found: false, decidedAbsent: true, reason: "운영자가 DART 미등록으로 확정" }`(호출 안 함); `decisions.dart` 가 코드면 `getCompanyProfile(name, undefined, { corpCode })`; `decisions.nps` 가 있으면 `lookupWorkplace(name, { businessNo: decisions.nps })`(6자리를 넘기면 prefix 비교가 된다). `sourceEvidence.dart()` 는 `decidedAbsent` 면 `absent` + 위 요약. 라우트 두 곳은 `listSourceDecisions` 로 `{ dart, nps }` 를 만들어 넘긴다.

- [ ] **Step 1: Failing tests** — `collectEvidence.test.ts` 에:
```ts
  test("a DART 'none' decision skips the lookup and reads as absent by decision", async () => {
    const deps = collectors();   // 파일의 기존 mock 헬퍼 이름을 확인해 그대로 쓴다
    const result = await collectEvidence({ name: "㈜가", year: 2026, businessNo: "1234567890" }, deps, { dart: "none" });
    expect(deps.getCompanyProfile).not.toHaveBeenCalled();
    expect(result.evidence.profile).toMatchObject({ found: false, decidedAbsent: true });
  });

  test("a DART corp code decision is passed as a hint and an NPS prefix pins the workplace", async () => {
    const deps = collectors();
    await collectEvidence({ name: "㈜가", year: 2026, businessNo: null }, deps, { dart: "00123456", nps: "625870" });
    expect(deps.getCompanyProfile).toHaveBeenCalledWith("㈜가", undefined, { corpCode: "00123456" });
    expect(deps.lookupWorkplace).toHaveBeenCalledWith("㈜가", { businessNo: "625870" });
  });
```
  `dart.test.ts` 에:
```ts
  test("a corp code hint skips name resolution", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ status: "000", corp_name: "주식회사 가", bizr_no: "1234567890" }));
    const profile = await getCompanyProfile("㈜가", { fetchImpl }, { corpCode: "00123456" });
    expect(profile).toMatchObject({ found: true, corpCode: "00123456", corpName: "주식회사 가", businessNo: "1234567890" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("corp_code=00123456");
  });
```
  `sourceEvidence.test.ts` 에: `toSnapshots` 에 `profile: { found: false, decidedAbsent: true, reason: "운영자가 DART 미등록으로 확정" }` 를 주면 dart 스냅샷이 `{ status: "absent", summary: "운영자가 DART 미등록으로 확정" }`.
- [ ] **Step 2: Run → fails**
- [ ] **Step 3: Implement** — `CompanyProfile` 에 `decidedAbsent?: boolean` 추가. `getCompanyProfile`: `hints.corpCode` 가 있으면 `exact = { corpCode: hints.corpCode, corpName: companyName, stockCode: null }` 로 바로 호출(기존 `resolveCorp` 는 `getCompanyProfile` 안에서만 쓰이므로 분기만 추가). `resolveCorp` 가 캐시를 갱신하는 부수효과가 있으면 힌트 경로에서도 `refreshCorpCodes` 는 라우트가 이미 부르므로 생략. `collectEvidence` 세 번째 인자 처리. 라우트 두 곳: `const decisions = Object.fromEntries((await listSourceDecisions(id)).map((d) => [d.source, d.value]))`.
- [ ] **Step 4: Run → pass** · **Step 5: Commit** `feat(review): honour operator decisions when re-checking DART and NPS`

---

### Task 3: 별칭까지 합쳐 뉴스 수집

**Files:** Create `src/lib/services/collectForCompany.ts` · Modify `src/app/api/analyze/route.ts`, `src/app/api/analyze/batch/route.ts` · Test `src/lib/services/collectForCompany.test.ts`

**Interfaces:**
```ts
export function parseAliases(raw: string | null): string[];                       // JSON 배열, 실패·빈값은 []
export async function collectForCompany(company: { name: string; aliases: string | null }, options: Omit<CollectOptions, "query">, deps?: { collect?: typeof collectNews }): Promise<CollectResult>;
// 이름 + 별칭을 차례로 collectNews 하고 link 기준으로 합친다. duplicatesRemoved 는 합산 + 교차 중복 수, errors 는 이어 붙임. 레이트리밋은 그대로 던진다
```
- [ ] **Step 1: Failing test**
```ts
// src/lib/services/collectForCompany.test.ts
import { describe, expect, test, vi } from "vitest";
import { collectForCompany, parseAliases } from "@/lib/services/collectForCompany";
import type { NewsItem } from "@/lib/services/newsTypes";

const item = (link: string, title = link): NewsItem => ({ title, link, description: "", content: "", published: "2026-08-01", source: "s", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" });

describe("parseAliases", () => {
  test("reads a JSON array and tolerates junk", () => {
    expect(parseAliases('["한빛IT","Hanbit ICT"]')).toEqual(["한빛IT", "Hanbit ICT"]);
    expect(parseAliases(null)).toEqual([]);
    expect(parseAliases("oops")).toEqual([]);
  });
});

describe("collectForCompany", () => {
  test("queries the name and every alias, merging by link", async () => {
    const collect = vi.fn()
      .mockResolvedValueOnce({ items: [item("https://n/1"), item("https://n/2")], duplicatesRemoved: 1, errors: [], primaryCount: 2, noNews: false })
      .mockResolvedValueOnce({ items: [item("https://n/2"), item("https://n/3")], duplicatesRemoved: 0, errors: ["구글 오류"], primaryCount: 2, noNews: false });
    const result = await collectForCompany({ name: "㈜한빛정보통신", aliases: '["한빛IT"]' }, { limit: 20 }, { collect });
    expect(collect.mock.calls.map((c) => c[0].query)).toEqual(["㈜한빛정보통신", "한빛IT"]);
    expect(result.items.map((i) => i.link)).toEqual(["https://n/1", "https://n/2", "https://n/3"]);
    expect(result.duplicatesRemoved).toBe(2);
    expect(result.errors).toEqual(["구글 오류"]);
    expect(result.primaryCount).toBe(3);
    expect(result.noNews).toBe(false);
  });

  test("without aliases it is a single query", async () => {
    const collect = vi.fn().mockResolvedValue({ items: [], duplicatesRemoved: 0, errors: [], primaryCount: 0, noNews: true });
    const result = await collectForCompany({ name: "㈜가", aliases: null }, { limit: 20 }, { collect });
    expect(collect).toHaveBeenCalledTimes(1);
    expect(result.noNews).toBe(true);
  });
});
```
- [ ] **Step 2: Run → fails** · **Step 3: Implement**
```ts
// src/lib/services/collectForCompany.ts
import { collectNews, type CollectOptions, type CollectResult } from "@/lib/services/newsCollector";

/**
 * 별칭 칸의 JSON 을 읽는다. 깨진 값은 빈 목록이다 — 별칭 때문에 수집이 멈추면 안 된다.
 */
export function parseAliases(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * 회사명과 별칭을 차례로 검색해 링크 기준으로 합친다. 일반명사 상호는 별칭 없이는 기사가 0건이다.
 */
export async function collectForCompany(company: { name: string; aliases: string | null }, options: Omit<CollectOptions, "query">, deps: { collect?: typeof collectNews } = {}): Promise<CollectResult> {
  const collect = deps.collect ?? collectNews;
  const queries = [company.name, ...parseAliases(company.aliases).filter((alias) => alias !== company.name)];
  const seen = new Set<string>();
  const merged: CollectResult = { items: [], duplicatesRemoved: 0, errors: [], primaryCount: 0, noNews: true };
  for (const query of queries) {
    const result = await collect({ ...options, query });
    merged.duplicatesRemoved += result.duplicatesRemoved;
    merged.errors.push(...result.errors);
    for (const entry of result.items) {
      if (seen.has(entry.link)) { merged.duplicatesRemoved += 1; continue; }
      seen.add(entry.link);
      merged.items.push(entry);
    }
  }
  merged.primaryCount = merged.items.filter((entry) => entry.relevance === "primary").length;
  merged.noNews = merged.items.length === 0;
  return merged;
}
```
  `CollectResult` 의 정확한 필드(`primaryCount` `noNews`)는 `newsCollector.ts:26` 근처에서 확인해 맞춘다. 라우트: `/api/analyze` 는 `collectNews({query: company.name, …})` → `collectForCompany(company, {…})`; 배치는 `BatchTarget` 에 `aliases: string | null` 을 더하고 `collect: (options) => collectForCompany({ name: options.query, aliases: … }, options)` 가 되도록 `BatchDeps.collect` 호출부에서 target 을 알 수 있게 `runOne` 에서 `deps.collect({ …, query: target.name, aliases: target.aliases })` 로 바꾼다(`BatchDeps.collect` 옵션 타입에 `aliases?: string | null` 추가, `batchRun.test.ts` 의 `toHaveBeenCalled` 단언은 그대로 통과한다).
- [ ] **Step 4: Run → pass** · **Step 5: Commit** `feat(review): search aliases join the company name when collecting news`

---

### Task 4: 확인 필요 항목 조립

**Files:** Create `src/lib/repositories/reviewItems.ts` · Test `src/lib/repositories/reviewItems.test.ts`

**Interfaces:**
```ts
export type ReviewItem =
  | { kind: "nps_conflict"; candidates: Array<{ prefix: string; name: string; address: string | null; registryMatch: boolean }> ; chosen: string | null }
  | { kind: "dart_conflict"; candidate: { corpCode: string; corpName: string; stockCode: string | null } }
  | { kind: "verification"; runId: number; status: "needs_review"; failed: string[]; faithfulness: number | null; sourceCoverage: number; evidenceMatch: number; counterEvidence: string[]; note: string | null }
  | { kind: "open_events"; events: Array<{ id: number; occurredAt: string; severity: "alert" | "notice"; kind: string; title: string; evidence: Array<{ label: string; link?: string }> }> }
  | { kind: "no_news"; aliases: string[] }
  | { kind: "no_business_no"; npsPrefix: string | null };
export type ReviewSummary = { items: ReviewItem[]; lastDecidedAt: string | null };
export async function buildReviewItems(companyId: number): Promise<ReviewSummary | null>;
```
규칙 — 나타나는 조건:
- `nps_conflict`: `SourceSnapshot(nps)` 가 `conflict` 이고 `SourceDecision(nps)` 가 없다. `candidates` 는 payload `candidates[]`; `registryMatch = company.businessNo?.slice(0,6) === prefix`
- `dart_conflict`: `SourceSnapshot(dart)` 가 `conflict` 이고 payload `candidates.length === 1` 이고 결정이 없다(후보가 여럿이면 첫 후보만 보이되 `candidate` 는 첫 항목)
- `verification`: 최신 완료 실행의 검증이 `needs_review` 이고 `reviewedAt` 이 null. `failed` 는 Task 13 의 게이트 판정 로직과 같다(임계 상수 import)
- `open_events`: `severity in (alert, notice)` · `status = open`, 최신순
- `no_news`: 최신 실행 상태가 `no_news`(또는 완료 실행이 있는데 `stats.scoredNews === 0`)
- `no_business_no`: `company.businessNo` 가 null. `npsPrefix` 는 nps 스냅샷 payload 의 `businessNoPrefix`
- `lastDecidedAt`: 결정·검토·사건 확인 중 가장 최근 시각

- [ ] **Step 1: Failing tests**
```ts
// src/lib/repositories/reviewItems.test.ts
import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { saveSourceDecision } from "@/lib/repositories/sourceDecision";
import { buildReviewItems } from "@/lib/repositories/reviewItems";

async function company(over: Record<string, unknown> = {}) {
  return prisma.company.create({ data: { name: "㈜가", year: 2026, businessNo: "6258700001", ...over } });
}

describe("buildReviewItems", () => {
  beforeEach(resetDatabase);

  test("lists an NPS conflict with the registry-matching candidate flagged, until a decision is saved", async () => {
    const c = await company();
    await prisma.sourceSnapshot.create({ data: { companyId: c.id, source: "nps", status: "conflict", summary: "후보 2건", payload: JSON.stringify({ candidates: [{ companyName: "㈜가", businessNoPrefix: "625870", address: "서울" }, { companyName: "가", businessNoPrefix: "111111", address: null }] }) } });
    const before = (await buildReviewItems(c.id))!;
    expect(before.items).toContainEqual({ kind: "nps_conflict", chosen: null, candidates: [{ prefix: "625870", name: "㈜가", address: "서울", registryMatch: true }, { prefix: "111111", name: "가", address: null, registryMatch: false }] });
    await saveSourceDecision({ companyId: c.id, source: "nps", value: "625870", userId: 1 });
    expect((await buildReviewItems(c.id))!.items.find((i) => i.kind === "nps_conflict")).toBeUndefined();
  });

  test("lists a single DART candidate, open alert/notice events, an unreviewed verification and no-news", async () => {
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    const c = await company({ aliases: '["가 테크"]' });
    await prisma.sourceSnapshot.create({ data: { companyId: c.id, source: "dart", status: "conflict", summary: "후보 1건", payload: JSON.stringify({ candidates: [{ corpCode: "00123", corpName: "주식회사 가", stockCode: null }] }) } });
    const base = { companyId: c.id, occurredAt: new Date("2026-08-20"), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, kind: "closure", severity: "alert", status: "open", evidenceKey: "1" } });
    await prisma.event.create({ data: { ...base, kind: "award", severity: "positive", status: "open", evidenceKey: "2" } });
    await prisma.event.create({ data: { ...base, kind: "headcount_down", severity: "notice", status: "done", evidenceKey: "3" } });
    const run = await prisma.analysisRun.create({ data: { companyId: c.id, userId: user.id, model: "m", status: "no_news", newsJson: "[]", resultJson: JSON.stringify({ stats: { scoredNews: 0 } }), completedAt: new Date() } });
    await prisma.verificationResult.create({ data: { analysisRunId: run.id, status: "needs_review", faithfulness: 0.5, sourceCoverage: 1, evidenceMatch: 0.7, unsupportedClaims: "[]", counterEvidence: '["보도자료 의존"]', detailJson: "{}" } });
    const summary = (await buildReviewItems(c.id))!;
    const kinds = summary.items.map((i) => i.kind);
    expect(kinds).toEqual(["dart_conflict", "verification", "open_events", "no_news"]);
    expect(summary.items[0]).toMatchObject({ candidate: { corpCode: "00123", corpName: "주식회사 가" } });
    expect(summary.items[1]).toMatchObject({ runId: run.id, failed: ["근거 충실도"], counterEvidence: ["보도자료 의존"] });
    expect((summary.items[2] as { events: unknown[] }).events).toHaveLength(1);
    expect(summary.items[3]).toEqual({ kind: "no_news", aliases: ["가 테크"] });
  });

  test("flags a missing business number with the NPS prefix pre-filled, and returns nothing to review when clean", async () => {
    const c = await company({ businessNo: null });
    await prisma.sourceSnapshot.create({ data: { companyId: c.id, source: "nps", status: "found", summary: "가입자 8명", payload: JSON.stringify({ businessNoPrefix: "625870" }) } });
    expect((await buildReviewItems(c.id))!.items).toEqual([{ kind: "no_business_no", npsPrefix: "625870" }]);
    const clean = await company({ name: "㈜나" });
    expect((await buildReviewItems(clean.id))!.items).toEqual([]);
    expect(await buildReviewItems(999)).toBeNull();
  });
});
```
  순서 고정: `nps_conflict` → `dart_conflict` → `verification` → `open_events` → `no_news` → `no_business_no`... 시안은 사업자번호를 맨 위에 두었으므로 **`no_business_no` 를 첫 번째**로 한다 — 두 번째 테스트에는 사업자번호가 있어 영향 없고, 세 번째 테스트는 단독이다. 최종 순서: `no_business_no` → `nps_conflict` → `dart_conflict` → `verification` → `open_events` → `no_news`.
- [ ] **Step 2: Run → fails** · **Step 3: Implement** — `prisma.company.findUnique` 에 `sourceSnapshots`, `sourceDecisions`, `events(where severity in, status open, orderBy occurredAt desc)`, `analysisRuns(take 1, orderBy createdAt desc, include verification)` 를 include. payload 는 `JSON.parse` 를 try 로 감싼다. `failed` 계산은 `verification-panel.tsx` 의 로직을 `src/lib/services/verificationScores.ts` 에 `failedGates({sourceCoverage, faithfulness, evidenceMatch}): string[]` 로 옮겨 두 곳이 같이 쓴다(패널 테스트는 그대로 통과).
- [ ] **Step 4: Run → pass** · **Step 5: Commit** `feat(review): assemble the items a person must settle for a company`

---

### Task 5: Server Actions

**Files:** Create `src/app/companies/[id]/actions.ts` · Test `src/app/companies/[id]/actions.test.ts`

**Interfaces:** (모두 `"use server"`, 세션 없으면 `{ ok: false, message: "unauthorized" }`, 성공 시 `revalidatePath(\`/companies/${id}\`)`)
```ts
export async function decideNpsAction(input: { companyId: number; prefix: string; label: string }): Promise<ActionResult>;   // 저장 → refreshSourcesFor(companyId)
export async function holdNpsAction(input: { companyId: number }): Promise<ActionResult>;                                     // 결정 삭제(보류) — 항목은 남는다
export async function decideDartAction(input: { companyId: number; corpCode: string | "none"; label?: string }): Promise<ActionResult>; // 저장 → 재조회
export async function reviewVerificationAction(input: { runId: number; note: string }): Promise<ActionResult>;                // reviewedAt/By/Note
export async function confirmEventsAction(input: { companyId: number; eventIds: number[]; action: "acknowledge" | "done" }): Promise<ActionResult>; // reviewEvent 반복
export async function saveAliasesAction(input: { companyId: number; aliases: string[] }): Promise<ActionResult>;             // Company.aliases JSON
export async function saveBusinessNoAction(input: { companyId: number; businessNo: string }): Promise<ActionResult>;         // 10자리 검증 → updateCompany → 재조회
type ActionResult = { ok: true } | { ok: false; message: string };
```
`refreshSourcesFor(companyId)` 는 배치 라우트의 `refreshSources` 와 같은 순서를 `src/lib/services/refreshSources.ts` 로 옮겨 세 곳(단건 라우트·배치·액션)이 공유한다 — 결정(`listSourceDecisions`)도 그 안에서 읽는다.

- [ ] **Step 1: Failing tests** — `vi.mock("@/auth")`, `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`, `vi.mock("@/lib/services/refreshSources", () => ({ refreshSourcesFor: vi.fn(async () => ({})) }))`. 케이스: 익명은 `unauthorized`; `decideNpsAction` 이 결정을 저장하고 `refreshSourcesFor` 를 부른다; `decideDartAction("none")` 저장; `reviewVerificationAction` 이 `reviewedAt`·`reviewNote` 를 쓴다; `confirmEventsAction` 이 두 사건을 `acknowledged` 로 바꾸고 `reviewedBy` 를 남긴다; `saveAliasesAction` 이 공백 제거·중복 제거 후 JSON 으로 저장; `saveBusinessNoAction` 은 `123-45-67890` 처럼 구분자를 지워 10자리로 저장하고 재조회, 9자리는 `{ ok: false }`.
- [ ] **Step 2: Run → fails** · **Step 3: Implement** (기존 `src/app/dashboard/actions.ts` 가 있었을 때의 세션 확인 패턴: `const session = await auth(); const userId = Number(session?.user?.id); if (!userId) return { ok: false, message: "unauthorized" }`)
- [ ] **Step 4: Run → pass** · **Step 5: Commit** `feat(review): server actions for decisions, review, event confirmation, aliases and business number`

---

### Task 6: 화면 블록과 상세 페이지 배치

**Files:** Create `src/components/company/review-block.tsx` · Modify `src/app/companies/[id]/page.tsx` · Test `src/components/company/review-block.test.tsx`

**Interfaces:**
```tsx
export function ReviewBlock({ companyId, summary, actions }: { companyId: number; summary: ReviewSummary; actions: ReviewActions }): JSX.Element;
// actions = { decideNps, holdNps, decideDart, reviewVerification, confirmEvents, saveAliases, saveBusinessNo } — 페이지가 Server Action 을 그대로 넘긴다(테스트는 vi.fn)
```
렌더 규칙(시안 그대로):
- `<Panel index="00" title="확인 필요" tag={n>0 ? \`${n}건\` : "없음"} tone={n>0 ? "review" : "plain"} note=…>` — `Panel`/`SectionHead` 의 `tone` 에 `"review"` 를 추가한다(태그 테두리·글자 review 색). 항목 0이면 note 에 `동명 충돌 0 · 검토 필요 0 · 미확인 경보·주의 0 · 기사 있음 · 마지막 정리 {MM-DD HH:mm}`(lastDecidedAt 없으면 "정리 기록 없음") 만 있고 본문 없음.
- 항목 레이아웃 `grid grid-cols-[200px_minmax(0,1fr)_180px]`: 왼쪽(아이콘+제목+why) · 가운데(내용) · 오른쪽(버튼 세로).
- `no_business_no`: 입력 하나(`aria-label="사업자번호"`, `defaultValue={npsPrefix ?? ""}`) + 미리보기 문장(입력값이 10자리면 "국세청·나라장터·금융위 조회 가능", 아니면 "10자리를 입력하면 국세청·나라장터·금융위가 열린다") + `저장 후 원천 대조`.
- `nps_conflict`: 라디오 목록(`aria-label={name}`), `registryMatch` 면 `등록 번호 일치` 표시와 기본 선택; 버튼 `이 사업장으로 확정`(선택 없으면 disabled) · `보류`.
- `dart_conflict`: 후보 1장 + `이 기업이 맞다` · `아니다 — DART 미등록으로 확정`.
- `verification`: 게이트 4칸(값 · 임계, 탈락은 review 색) + `textarea aria-label="검토 메모"` + `검토 완료로 기록` + 링크 `검증 근거 열기`(#verification — 기존 패널 버튼에 id 부여).
- `open_events`: 행마다 체크박스(`aria-label={title}`) + 날짜 + `SeverityMark` + 제목 + 근거 링크; 버튼 `선택 {n}건 확인`(0 이면 disabled) · `모두 확인`; 각 행 오른쪽에 `조치완료` 작은 버튼은 두지 않는다(확인만 — 감점 근거는 acknowledge 로 충분).
- `no_news`: 별칭 칩 + 입력(`aria-label="검색 별칭"`, Enter 로 추가) + `저장 후 수집만 재실행`(저장 뒤 `/companies?year={year}&run={companyId}&stage=news#batch` 로 이동 — `BatchRunner` 가 `stage` 파라미터도 읽도록 `preselected` 옆에 `initialStage` prop 추가, 페이지에서 넘긴다).
- 액션 결과 `{ok:false}` 는 `<p role="alert">` 로.

- [ ] **Step 1: Failing tests** — 항목별 렌더/클릭 6개 + 빈 상태 1개. 예:
```tsx
  test("nps conflict preselects the registry-matching candidate and confirms it", async () => {
    const actions = mockActions();
    render(<ReviewBlock companyId={1} summary={{ items: [{ kind: "nps_conflict", chosen: null, candidates: [{ prefix: "625870", name: "㈜가", address: "서울", registryMatch: true }, { prefix: "111111", name: "가", address: null, registryMatch: false }] }], lastDecidedAt: null }} actions={actions} />);
    expect(screen.getByRole("radio", { name: "㈜가" })).toBeChecked();
    expect(screen.getByText("등록 번호 일치")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 사업장으로 확정" }));
    await waitFor(() => expect(actions.decideNps).toHaveBeenCalledWith({ companyId: 1, prefix: "625870", label: "㈜가 · 서울" }));
  });
  test("with nothing to settle it is one line that still says zero", () => {
    render(<ReviewBlock companyId={1} summary={{ items: [], lastDecidedAt: "2026-08-30T05:20:00.000Z" }} actions={mockActions()} />);
    expect(screen.getByRole("heading", { name: "확인 필요" })).toBeInTheDocument();
    expect(screen.getByText("없음")).toBeInTheDocument();
    expect(screen.getByText(/동명 충돌 0 · 검토 필요 0 · 미확인 경보·주의 0/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
```
  나머지: dart "아니다" → `decideDart({companyId, corpCode:"none"})`; 검토 메모 입력 후 기록 → `reviewVerification({runId, note})`; 사건 두 개 중 하나 체크 → `선택 1건 확인` → `confirmEvents({companyId, eventIds:[id], action:"acknowledge"})`, `모두 확인` → 둘 다; 별칭 Enter 추가 후 저장 → `saveAliases({companyId, aliases:[…]})`; 사업자번호 `123-45-67890` 입력 → 미리보기 문구 바뀜 → 저장 → `saveBusinessNo({companyId, businessNo:"123-45-67890"})`.
- [ ] **Step 2: Run → fails** · **Step 3: Implement** (클라이언트 컴포넌트, `useTransition` 으로 액션 호출, 성공 시 `router.refresh()`) · 페이지: `const review = await buildReviewItems(company.id)` 후 헤더 바로 아래 `<ReviewBlock companyId={company.id} summary={review} actions={{ decideNps: decideNpsAction, … }} />`, 기존 절 번호를 `01 기여도 · 인용 근거`, `02 사건 이력` 로 붙인다(`Panel index`).
- [ ] **Step 4: Run → pass**, then `npx vitest run && npm run lint && npm run build`, 개발 서버에서 SDT(29)·써로마인드(14)·이퀄라이저(52)·넷록스(3) 상세를 받아 항목이 뜨는지 확인
- [ ] **Step 5: Commit** `feat: 확인 필요 block on the company page — decisions, review, event confirmation, aliases, business number`

---

### Task 7: 문서

- [ ] 브리프 §4-A 기업 상세 인벤토리에 `⓪ 확인 필요` 블록 한 줄, §4-B 의 [사업자번호 후보 선택 모달]·[기업 등록 모달 확장] 항목에 "→ 기업 상세 확인 필요 블록으로 통합 2026-08-30". CLAUDE.md §프로젝트 한 줄. 로드맵 Task 5 잔여 항목 완료 표기.
- [ ] Commit `docs: record the review block as done`
