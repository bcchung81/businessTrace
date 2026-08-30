# 리포트·실행 이력 화면 F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports` 한 화면에서 분석 실행 이력(엑셀 링크 포함)·월간 문서 다운로드·제출 자료 보관함(파일명·제출일·해시)을 관리한다.

**Architecture:** 실행 이력은 `AnalysisRun`(+`VerificationResult`)을 읽는 새 리포지토리 함수 하나로 끝난다 — 화면 전용 조립은 서버 컴포넌트에서. 월간 문서는 기존 `/api/reports/monthly` 를 링크로 나열만 한다(생성 로직 재사용). 제출 보관함은 새 `Submission` 모델 + 업로드 server action(sha-256 은 서버에서 계산, 파일은 `data/submissions/` — gitignore 영역)이다.

**Tech Stack:** Next.js 16 App Router · Prisma(SQLite) · node:crypto(sha256) · vitest + Testing Library

**Spec:** `docs/superpowers/plans/2026-09-01-next-session.md` §5 + 마스터 로드맵 Task F 상당

## Global Constraints

- 주석은 함수 설명 JSDoc 만, 본문 3줄 이내 (CLAUDE.md)
- 실패 테스트 → 구현 → 통과 → 태스크 단위 커밋. 파일 생성 명령과 커밋 명령 분리(훅이 전체 스위트 실행)
- 리포지토리 테스트는 실 DB: `resetDatabase` + `beforeEach` 관례. **`resetDatabase` 에 `prisma.submission.deleteMany()` 추가**를 잊지 않는다
- 마이그레이션 후 `npx prisma generate` + `npm run db:migrate:test` + **개발 서버 재시작**(prisma 클라이언트 싱글턴 캐시 — 2026-09-01 실증)
- 숫자 열 `tabular-nums` · 사각 · 그림자 없음 · 표는 Panel 문법
- 다운로드 링크는 기존 라우트를 그대로 쓴다: 실행별 `/api/reports/{runId}`, 월간 `/api/reports/monthly?year=Y&month=M`

---

### Task 1: 실행 이력 리포지토리

**Files:**
- Modify: `src/lib/repositories/analysisRun.ts` (함수 추가)
- Test: `src/lib/repositories/analysisRun.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces:
  - `RunHistoryRow = { id: number; companyId: number; companyName: string; status: string; articleCount: number; verdict: "verified" | "needs_review" | "risk" | null; usage: { inputTokens: number; outputTokens: number } | null; periodStart: string | null; periodEnd: string | null; createdAt: string; completedAt: string | null }`
  - `listRunHistory(input: { year: number; limit?: number }): Promise<RunHistoryRow[]>` — createdAt 내림차순, limit 기본 100

- [ ] **Step 1: 실패 테스트 작성** — 기존 `analysisRun.test.ts` 에 추가:

```ts
describe("listRunHistory", () => {
  beforeEach(resetDatabase);

  it("lists completed and running runs newest first with article counts and verdict", async () => {
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const done = await prisma.analysisRun.create({
      data: {
        companyId: company.id, userId: user.id, model: "m", status: "completed",
        newsJson: JSON.stringify([{ title: "a" }, { title: "b" }]),
        usageJson: JSON.stringify({ inputTokens: 100, outputTokens: 20 }),
        completedAt: new Date(),
      },
    });
    await prisma.verificationResult.create({
      data: { analysisRunId: done.id, status: "verified", faithfulness: 1, unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" },
    });

    const rows = await listRunHistory({ year: 2025 });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ companyName: "딥노이드", status: "completed", articleCount: 2, verdict: "verified", usage: { inputTokens: 100, outputTokens: 20 } });
  });
});
```

주의: `VerificationResult` 의 필수 컬럼은 `prisma/schema.prisma` 의 실제 모델을 열어 맞춘다(테스트 작성 시점에 확인 — 위 data 는 최소 필수 조합 예상치다).

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/repositories/analysisRun.test.ts` → FAIL (함수 없음)

- [ ] **Step 3: 구현** — `analysisRun.ts` 에 추가:

```ts
export type RunHistoryRow = {
  id: number; companyId: number; companyName: string; status: string; articleCount: number;
  verdict: "verified" | "needs_review" | "risk" | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  periodStart: string | null; periodEnd: string | null; createdAt: string; completedAt: string | null;
};

/**
 * 실행 이력을 최신순으로 낸다 — 기사 수는 newsJson 길이, 판정은 검증 결과에서 읽는다.
 */
export async function listRunHistory(input: { year: number; limit?: number }): Promise<RunHistoryRow[]> {
  const rows = await prisma.analysisRun.findMany({
    where: { company: { year: input.year, isActive: true } },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 100,
    include: { company: { select: { name: true } }, verification: { select: { status: true } } },
  });
  return rows.map((row) => {
    const news = JSON.parse(row.newsJson) as unknown[];
    const usage = row.usageJson ? (JSON.parse(row.usageJson) as { inputTokens?: number; outputTokens?: number }) : null;
    return {
      id: row.id, companyId: row.companyId, companyName: row.company.name, status: row.status,
      articleCount: Array.isArray(news) ? news.length : 0,
      verdict: (row.verification?.status as RunHistoryRow["verdict"]) ?? null,
      usage: usage ? { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } : null,
      periodStart: row.periodStart?.toISOString() ?? null, periodEnd: row.periodEnd?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
    };
  });
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat(reports): run history listing"`

---

### Task 2: Submission 모델 + 리포지토리

**Files:**
- Modify: `prisma/schema.prisma` · `src/lib/test-support/db.ts`
- Create: `src/lib/repositories/submission.ts`
- Test: `src/lib/repositories/submission.test.ts`

**Interfaces:**
- Produces:
  - `SubmissionRow = { id: number; filename: string; sha256: string; size: number; note: string | null; submittedAt: string; submittedBy: number }`
  - `createSubmission(input: { filename: string; sha256: string; size: number; note: string | null; userId: number }): Promise<SubmissionRow>`
  - `listSubmissions(): Promise<SubmissionRow[]>` — submittedAt 내림차순

- [ ] **Step 1: 스키마** — schema.prisma 끝에 (User 관계는 두지 않는다 — 제출자는 id 만 기록):

```prisma
model Submission {
  id          Int      @id @default(autoincrement())
  filename    String
  storedPath  String
  sha256      String
  size        Int
  note        String?
  submittedAt DateTime @default(now())
  submittedBy Int
}
```

- [ ] **Step 2: 마이그레이션** — `npx prisma migrate dev --name submission && npx prisma generate && npm run db:migrate:test`
- [ ] **Step 3: resetDatabase 에 `await prisma.submission.deleteMany();` 추가** (event 줄 다음)
- [ ] **Step 4: 실패 테스트 작성** — `submission.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";
import { createSubmission, listSubmissions } from "@/lib/repositories/submission";

describe("submission repository", () => {
  beforeEach(resetDatabase);

  it("records a submission with its hash and lists newest first", async () => {
    await createSubmission({ filename: "8월 제출.xlsx", storedPath: "data/submissions/1.xlsx", sha256: "ab".repeat(32), size: 1024, note: null, userId: 1 });
    const second = await createSubmission({ filename: "9월 제출.xlsx", storedPath: "data/submissions/2.xlsx", sha256: "cd".repeat(32), size: 2048, note: "수정본", userId: 1 });

    const rows = await listSubmissions();
    expect(rows.map((row) => row.filename)).toEqual(["9월 제출.xlsx", "8월 제출.xlsx"]);
    expect(rows[0]).toMatchObject({ id: second.id, sha256: "cd".repeat(32), size: 2048, note: "수정본", submittedBy: 1 });
  });
});
```

- [ ] **Step 5: 실패 확인** → FAIL (모듈 없음)
- [ ] **Step 6: 구현** — `submission.ts`:

```ts
import { prisma } from "@/lib/db";

export type SubmissionRow = {
  id: number; filename: string; storedPath: string; sha256: string; size: number;
  note: string | null; submittedAt: string; submittedBy: number;
};

function toRow(row: { id: number; filename: string; storedPath: string; sha256: string; size: number; note: string | null; submittedAt: Date; submittedBy: number }): SubmissionRow {
  return { ...row, submittedAt: row.submittedAt.toISOString() };
}

/**
 * 제출 자료를 해시와 함께 기록한다 — 나중에 "그때 낸 파일이 이것"임을 증명하는 근거다.
 */
export async function createSubmission(input: { filename: string; storedPath: string; sha256: string; size: number; note: string | null; userId: number }): Promise<SubmissionRow> {
  const row = await prisma.submission.create({
    data: { filename: input.filename, storedPath: input.storedPath, sha256: input.sha256, size: input.size, note: input.note, submittedBy: input.userId },
  });
  return toRow(row);
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const rows = await prisma.submission.findMany({ orderBy: { submittedAt: "desc" } });
  return rows.map(toRow);
}
```

- [ ] **Step 7: 통과 확인** → PASS
- [ ] **Step 8: 커밋** — `git commit -m "feat(reports): submission archive model and repository"`

---

### Task 3: 제출 업로드 액션

**Files:**
- Create: `src/app/reports/actions.ts`
- Test: `src/lib/services/submissionUpload.test.ts` + Create: `src/lib/services/submissionUpload.ts` (순수 로직 분리)

**Interfaces:**
- Produces:
  - `hashAndName(buffer: Buffer, filename: string): { sha256: string; storedName: string }` — storedName 은 `${sha256 앞 12자리}-${안전한 파일명}`
  - `submitFileAction(formData: FormData): Promise<{ ok: true } | { ok: false; message: string }>` — `file`(File)·`note`(string) 필드, 20MB 초과 거부

- [ ] **Step 1: 실패 테스트** — `submissionUpload.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashAndName, MAX_SUBMISSION_BYTES } from "@/lib/services/submissionUpload";

describe("hashAndName", () => {
  it("hashes the content and builds a collision-safe stored name", () => {
    const { sha256, storedName } = hashAndName(Buffer.from("hello"), "8월 제출(최종).xlsx");

    expect(sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(storedName).toBe("2cf24dba5fb0-8월 제출(최종).xlsx");
  });

  it("keeps the size limit at 20MB", () => {
    expect(MAX_SUBMISSION_BYTES).toBe(20 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `submissionUpload.ts`:

```ts
import { createHash } from "node:crypto";

export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

/**
 * 내용 해시와 저장용 파일명을 만든다. 앞 12자리 해시 접두사로 동명 파일 충돌을 피한다.
 */
export function hashAndName(buffer: Buffer, filename: string): { sha256: string; storedName: string } {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const safe = filename.replace(/[/\\]/g, "_");
  return { sha256, storedName: `${sha256.slice(0, 12)}-${safe}` };
}
```

`src/app/reports/actions.ts`:

```ts
"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createSubmission } from "@/lib/repositories/submission";
import { hashAndName, MAX_SUBMISSION_BYTES } from "@/lib/services/submissionUpload";

const STORE_DIR = path.join(process.cwd(), "data", "submissions");

/**
 * 제출 파일을 data/submissions 에 저장하고 해시를 기록한다 — 파일 자체는 git 밖이다.
 */
export async function submitFileAction(formData: FormData): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: "unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "파일을 선택하세요." };
  if (file.size > MAX_SUBMISSION_BYTES) return { ok: false, message: "20MB 이하만 보관합니다." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { sha256, storedName } = hashAndName(buffer, file.name);
  await mkdir(STORE_DIR, { recursive: true });
  const storedPath = path.join("data", "submissions", storedName);
  await writeFile(path.join(process.cwd(), storedPath), buffer);
  const note = String(formData.get("note") ?? "").trim() || null;
  await createSubmission({ filename: file.name, storedPath, sha256, size: file.size, note, userId });
  revalidatePath("/reports");
  return { ok: true };
}
```

- [ ] **Step 4: 통과 확인** → PASS. `data/` 가 `.gitignore` 에 이미 있는지 확인(있다 — CLAUDE.md), 없으면 추가
- [ ] **Step 5: 커밋** — `git commit -m "feat(reports): submission upload action with content hash"`

---

### Task 4: `/reports` 페이지 + 컴포넌트 + 내비 05

**Files:**
- Create: `src/app/reports/page.tsx`
- Create: `src/components/reports/run-history-table.tsx` · `src/components/reports/monthly-doc-list.tsx` · `src/components/reports/submission-box.tsx`
- Modify: `src/components/layout/side-tabs.tsx` (05 리포트) · `src/components/layout/app-shell.test.tsx` (링크 수 4→5 + 05 단언)
- Test: `src/components/reports/run-history-table.test.tsx` · `src/components/reports/submission-box.test.tsx`

**Interfaces:**
- Consumes: `listRunHistory`(Task 1) · `listSubmissions`(Task 2) · `submitFileAction`(Task 3) · `latestEventAt`(eventRepository — 월간 문서 나열 범위) · `Panel`
- Produces: `/reports` 라우트, 내비 `05 리포트`

- [ ] **Step 1: 실패 테스트 작성** — run-history-table: 행에 기업명·기사 수·판정·토큰 합·`/api/reports/{id}` 링크가 있는지. submission-box: 파일 없이 제출하면 액션이 불리지 않는지, 목록에 파일명·해시 앞 12자·제출일이 보이는지 (`vi.mock("@/app/reports/actions", ...)` — confirm-selection.test 관례). 코드는 그 관례를 그대로 옮겨 작성한다:

```tsx
// run-history-table.test.tsx 핵심 단언
expect(screen.getByRole("link", { name: "엑셀" })).toHaveAttribute("href", "/api/reports/7");
expect(screen.getByText("딥노이드")).toBeInTheDocument();
expect(screen.getByText("120")).toBeInTheDocument(); // 토큰 합
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/reports` → FAIL
- [ ] **Step 3: 구현** — 표 3개는 기존 표 문법(`border-b-2 border-ink` 헤더 · `tabular-nums`)을 따른다. `monthly-doc-list` 는 서버 컴포넌트: 코호트 연도의 1월~현재 월을 나열하고 각 행에 `/api/reports/monthly?year=Y&month=M` 링크. `submission-box` 는 `"use client"` — `<form action={...}>` 대신 `submitFileAction(new FormData(form))` 호출(테스트 가능성).
- [ ] **Step 4: 페이지** — `/reports/page.tsx` 는 ranking/history 페이지 문법: Panel 01 실행 이력 · 02 월간 문서 · 03 제출 보관함. `side-tabs.tsx` 에 `{ href: "/reports", index: "05", label: "리포트" }`. app-shell.test 링크 수 4→5 + 05 단언 추가.
- [ ] **Step 5: 검증** — `npx next typegen && npm run build && npm run lint && npx vitest run src/components` → 통과. 개발 서버에서 `/reports` 200 과 업로드 1회 실물 확인
- [ ] **Step 6: 커밋** — `git commit -m "feat: reports screen with run history, monthly docs and submission archive"`

---

## Self-Review

- **Spec coverage:** §5 의 실행 이력 표(실행일시·기업·기사 수·판정·토큰·엑셀 링크)=Task 1+4, 월간 문서 목록=Task 4, 제출 보관함(파일명·제출일·해시)=Task 2+3+4, `/reports`+내비 05=Task 4. 누락 없음.
- **Placeholder scan:** Task 4 Step 1·3 은 관례 참조로 압축했으나 단언 예시·문법 출처를 명시했다 — 실행자가 confirm-selection.test·ranking 페이지를 열면 완성된다.
- **Type consistency:** `RunHistoryRow.verdict` ↔ VerificationResult.status 문자열, `SubmissionRow.storedPath` 는 Task 2 스키마·Task 3 액션에서 동일하게 사용.
