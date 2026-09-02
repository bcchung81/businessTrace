# 사용자 편의성 개선 실행 플랜 (2026-09-02)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 매일 쓰는 흐름(기업 정비 → 일괄 실행 → 확인 필요 정리 → 다운로드)이 화면을 떠나거나 새로고침해도 끊기지 않게 한다.

**Architecture:** Next.js 16 App Router 단일 스택 그대로. 로직은 `src/lib/services/*`, DB 접근은 `src/lib/repositories/*`, Route Handler·서버 액션은 얇게. 배치는 프로세스 메모리 레지스트리에 이벤트를 버퍼링하고 실행(POST)과 구독(GET SSE)을 분리한다. 표 상태는 URL 로 옮긴다.

**Tech Stack:** Next.js 16.3.3 · React 19 · Prisma 7 + SQLite · next-auth 5 beta · zod 4 · Vitest 4 + Testing Library · shadcn/ui + Tailwind v4

**Spec:** `docs/superpowers/specs/2026-09-02-usability-improvements-design.md` (진단 H1~H5·M1~M6·L1~L5 와 결정). 이 문서는 그것을 15개 태스크로 푼 것이다.

## Global Constraints

- Next.js **16.3.3** — `params`·`searchParams`·`cookies()` 는 Promise. 미들웨어는 `src/proxy.ts`. 예제 복사 전 `node_modules/next/dist/docs/` 확인
- **주석은 함수 설명 JSDoc 만, 본문 3줄 이내.** `//` 줄 주석은 훅이 경고한다
- 외부 API·LLM·네트워크 테스트 **전부 mock**
- 테스트는 `src/**/*.test.{ts,tsx}` 만 수집된다(`vitest.config.mts`). jsdom + Testing Library. 저장소 테스트는 `resetDatabase()`(`@/lib/test-support/db`)로 실제 SQLite 테스트 DB 를 쓴다
- 서버 액션 테스트는 `vi.mock("@/auth")`·`vi.mock("next/cache")` 패턴(`src/app/companies/[id]/actions.test.ts` 참조)
- 커밋은 태스크 단위. 커밋 훅이 `npm test` + `npm run lint` 를 강제한다 — **실패 테스트 파일을 남긴 채 다른 커밋을 하지 않는다**
- 디자인: 사각·그림자 없음·`Button` 은 `signal`/`signal-outline` 변형·상태색(`verified`·`review`·`risk`·`pending`)은 판정에만·숫자 열은 `tabular-nums`
- 새 최상위 디렉터리를 만들지 않는다
- 배치 레지스트리는 **이 플랜에서는 메모리**다. DB 이관은 배포 Task 16 의 몫이며, 여기서 정한 `subscribeBatch`/`publishBatchEvent` 인터페이스만 지킨다

---

## 파일 구조

```
src/lib/services/batchRegistry.ts             T2  이벤트 버퍼·구독·중단 요청 (기존 파일 확장)
src/lib/services/batchSession.ts              T2  배치를 백그라운드에서 완주시키고 레지스트리에 발행
src/app/api/analyze/batch/route.ts            T2  POST → 202 (실행 시작만)
src/app/api/analyze/batch/events/route.ts     T2  GET  → SSE 재생+구독
src/app/api/analyze/batch/abort/route.ts      T2  POST → 중단 요청
src/components/analysis/batch-runner.tsx      T2  실행/구독 분리, 재접속
src/components/layout/batch-indicator.tsx     T2  배지를 링크로

src/app/companies/actions.ts                  T1  editCompanyAction · setCompanyActiveAction
src/components/company/edit-company-dialog.tsx T1 상세 헤더의 편집 다이얼로그
src/components/layout/company-table.tsx       T1  제외·복귀 버튼

src/app/loading.tsx · error.tsx · not-found.tsx  T3

src/lib/services/companyCards.ts              T4  filterCards 에 query
src/components/company/company-card-grid.tsx  T4/T7 검색 입력 · URL 상태
src/components/ranking/ranking-table.tsx      T4/T7
src/components/dashboard/event-table.tsx      T7

src/components/company/review-block.tsx       T5  pending·성공 메시지

src/components/layout/side-tabs.tsx           T6  year 유지
src/components/layout/app-shell.tsx           T6/T12 Suspense · 로그아웃
src/app/reports/page.tsx                      T6  year 파라미터

src/lib/hooks/useUrlState.ts                  T7  URL 상태 훅

src/lib/repositories/companyRepository.ts     T8  listNeighbours
src/app/companies/[id]/page.tsx               T1/T8 편집 다이얼로그 · 이전/다음 · 사건 앵커
src/components/company/event-timeline.tsx     T8  행 id

src/app/dashboard/page.tsx                    T9  미분석 딥링크

src/components/ui/download-link.tsx           T10 생성 중 표시
src/app/ranking/page.tsx · reports/*.tsx · dashboard/page.tsx  T10

src/app/actions.ts                            T11 signOutAction
src/components/layout/sign-out-form.tsx       T11

src/lib/services/kst.ts                       T12 kstDateShort
src/components/company/company-row.tsx · dashboard/event-table.tsx  T12

src/components/company/verification-panel.tsx T13 오버레이·Esc·포커스
src/components/dashboard/event-table.tsx      T13 제목 줄바꿈

src/components/dashboard/section-head.tsx     T14 태그 설명
src/components/company/company-row.tsx        T14 열 설명
src/components/company/evidence-grid.tsx      T14 스트립 범례

src/components/company/register-dialog.tsx    T15 notice 정리
```

---

## Phase 1 — 높음

### Task 1: 기업 편집 다이얼로그 (H1)

**Files:**
- Create: `src/app/companies/actions.ts`
- Create: `src/app/companies/actions.test.ts`
- Create: `src/components/company/edit-company-dialog.tsx`
- Create: `src/components/company/edit-company-dialog.test.tsx`
- Modify: `src/components/layout/company-table.tsx` (상태 열에 제외·복귀 버튼)
- Modify: `src/components/layout/company-table.test.tsx`
- Modify: `src/app/companies/[id]/page.tsx:57-65` (헤더 우측에 다이얼로그)

**Interfaces:**
- Consumes: `updateCompany(id, patch)` · `refreshSourcesFor(companyId)` · `parseAliases(raw)`(`@/lib/services/collectForCompany`) · `ActionResult`(`@/app/companies/[id]/actions`)
- Produces:
  ```ts
  export async function editCompanyAction(input: { companyId: number; name: string; industry: string; businessNo: string; aliases: string[] }): Promise<ActionResult>
  export async function setCompanyActiveAction(input: { companyId: number; isActive: boolean }): Promise<ActionResult>
  export type EditableCompany = { id: number; year: number; name: string; industry: string | null; businessNo: string | null; aliases: string[]; isActive: boolean }
  export function EditCompanyDialog(props: { company: EditableCompany; actions: { edit: typeof editCompanyAction; setActive: typeof setCompanyActiveAction } })
  ```

- [ ] **Step 1: 서버 액션 실패 테스트**

`src/app/companies/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/refreshSources", () => ({ refreshSourcesFor: vi.fn(async () => ({})) }));
import { auth } from "@/auth";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import { editCompanyAction, setCompanyActiveAction } from "@/app/companies/actions";

describe("company edit actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "7" } } as never);
    vi.mocked(refreshSourcesFor).mockClear();
  });

  test("refuse anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect(await editCompanyAction({ companyId: 1, name: "x", industry: "", businessNo: "", aliases: [] })).toEqual({ ok: false, message: "unauthorized" });
  });

  test("edits name, industry, aliases; a new business number re-checks the sources", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await editCompanyAction({ companyId: c.id, name: " ㈜가나 ", industry: "ICT", businessNo: "120-88-24298", aliases: [" 가나 ", "가나", ""] })).toEqual({ ok: true });
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(stored).toMatchObject({ name: "㈜가나", industry: "ICT", businessNo: "1208824298", aliases: JSON.stringify(["가나"]) });
    expect(refreshSourcesFor).toHaveBeenCalledWith(c.id);
  });

  test("an unchanged business number does not re-check the sources; empty fields clear", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026, businessNo: "1208824298", industry: "ICT", aliases: JSON.stringify(["가"]) } });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜가", industry: "", businessNo: "120-88-24298", aliases: [] })).toEqual({ ok: true });
    const stored = await prisma.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(stored).toMatchObject({ industry: null, aliases: null, businessNo: "1208824298" });
    expect(refreshSourcesFor).not.toHaveBeenCalled();
  });

  test("surfaces repository errors — a name clash and a short number", async () => {
    await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜나", industry: "", businessNo: "", aliases: [] })).toEqual({ ok: false, message: "이미 등록된 기업입니다." });
    expect(await editCompanyAction({ companyId: c.id, name: "㈜가", industry: "", businessNo: "123", aliases: [] })).toEqual({ ok: false, message: "사업자번호는 숫자 10자리여야 합니다." });
  });

  test("excludes and restores a company without deleting the row", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await setCompanyActiveAction({ companyId: c.id, isActive: false })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(false);
    expect(await setCompanyActiveAction({ companyId: c.id, isActive: true })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).isActive).toBe(true);
    expect(await setCompanyActiveAction({ companyId: 9999, isActive: false })).toEqual({ ok: false, message: "기업을 찾을 수 없습니다." });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/companies/actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/companies/actions'`

- [ ] **Step 3: 서버 액션 구현**

`src/app/companies/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/app/companies/[id]/actions";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidate(companyId: number) {
  revalidatePath("/companies");
  revalidatePath(`/companies/${companyId}`);
}

/**
 * 이름·업종·사업자번호·검색 별칭을 한 번에 고친다.
 * 사업자번호가 새 값으로 바뀌었을 때만 원천을 재조회한다 — 닫혀 있던 국세청·나라장터·금융위가 이 번호로 열린다.
 */
export async function editCompanyAction(input: { companyId: number; name: string; industry: string; businessNo: string; aliases: string[] }): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, message: "unauthorized" };
  const before = await prisma.company.findUnique({ where: { id: input.companyId }, select: { businessNo: true } });
  if (!before) return { ok: false, message: "기업을 찾을 수 없습니다." };

  const updated = await updateCompany(input.companyId, {
    name: input.name,
    industry: input.industry.trim() || null,
    businessNo: input.businessNo.trim() || null,
  });
  if (!updated.ok) return { ok: false, message: updated.message };

  const aliases = [...new Set(input.aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))];
  await prisma.company.update({ where: { id: input.companyId }, data: { aliases: aliases.length > 0 ? JSON.stringify(aliases) : null } });

  if (updated.company.businessNo && updated.company.businessNo !== before.businessNo) await refreshSourcesFor(input.companyId);
  revalidate(input.companyId);
  return { ok: true };
}

/**
 * 분석 대상에서 빼거나 되돌린다. 행은 남는다 — AnalysisRun 이 참조한다.
 */
export async function setCompanyActiveAction(input: { companyId: number; isActive: boolean }): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, message: "unauthorized" };
  const updated = await updateCompany(input.companyId, { isActive: input.isActive });
  if (!updated.ok) return { ok: false, message: updated.message };
  revalidate(input.companyId);
  return { ok: true };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/app/companies/actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 다이얼로그 실패 테스트**

`src/components/company/edit-company-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EditCompanyDialog, type EditableCompany } from "@/components/company/edit-company-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const COMPANY: EditableCompany = { id: 3, year: 2026, name: "㈜가", industry: "ICT", businessNo: "1208824298", aliases: ["가", "가나"], isActive: true };

function setup(overrides: Partial<EditableCompany> = {}) {
  const edit = vi.fn(async () => ({ ok: true as const }));
  const setActive = vi.fn(async () => ({ ok: true as const }));
  render(<EditCompanyDialog company={{ ...COMPANY, ...overrides }} actions={{ edit, setActive }} />);
  fireEvent.click(screen.getByRole("button", { name: "기업 편집" }));
  return { edit, setActive };
}

describe("EditCompanyDialog", () => {
  test("opens with the current values and submits the edited ones", async () => {
    const { edit } = setup();
    expect(screen.getByLabelText("기업명")).toHaveValue("㈜가");
    expect(screen.getByLabelText("사업자번호")).toHaveValue("120-88-24298");
    expect(screen.getByLabelText("검색 별칭")).toHaveValue("가, 가나");
    fireEvent.change(screen.getByLabelText("업종"), { target: { value: "제조" } });
    fireEvent.change(screen.getByLabelText("검색 별칭"), { target: { value: "가나\n가나다, 가" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ companyId: 3, name: "㈜가", industry: "제조", businessNo: "120-88-24298", aliases: ["가나", "가나다", "가"] }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다."));
    expect(refresh).toHaveBeenCalled();
  });

  test("shows the action's error and keeps the form open", async () => {
    const edit = vi.fn(async () => ({ ok: false as const, message: "이미 등록된 기업입니다." }));
    render(<EditCompanyDialog company={COMPANY} actions={{ edit, setActive: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "기업 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이미 등록된 기업입니다."));
    expect(screen.getByLabelText("기업명")).toBeInTheDocument();
  });

  test("excluding takes two clicks, restoring one", async () => {
    const { setActive } = setup();
    fireEvent.click(screen.getByRole("button", { name: "분석 대상에서 제외" }));
    expect(setActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "정말 제외" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 3, isActive: false }));
  });

  test("an excluded company offers 복귀", async () => {
    const { setActive } = setup({ isActive: false });
    fireEvent.click(screen.getByRole("button", { name: "분석 대상으로 복귀" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 3, isActive: true }));
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/components/company/edit-company-dialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: 다이얼로그 구현**

`src/components/company/edit-company-dialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/companies/[id]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EditableCompany = { id: number; year: number; name: string; industry: string | null; businessNo: string | null; aliases: string[]; isActive: boolean };

type Actions = {
  edit: (input: { companyId: number; name: string; industry: string; businessNo: string; aliases: string[] }) => Promise<ActionResult>;
  setActive: (input: { companyId: number; isActive: boolean }) => Promise<ActionResult>;
};

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return "";
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

function splitAliases(raw: string) {
  return raw.split(/[\n,]/).map((alias) => alias.trim()).filter((alias) => alias.length > 0);
}

/**
 * 상세 헤더의 기업 편집 — 이름·업종·사업자번호·검색 별칭·분석 대상 여부를 한 폼에 둔다.
 * 제외는 두 번 눌러야 한다. 되돌릴 수는 있지만 랭킹·배치 대상에서 바로 빠지는 조치라 실수 한 번으로 일어나면 안 된다.
 */
export function EditCompanyDialog({ company, actions }: { company: EditableCompany; actions: Actions }) {
  const router = useRouter();
  const [name, setName] = useState(company.name);
  const [industry, setIndustry] = useState(company.industry ?? "");
  const [businessNo, setBusinessNo] = useState(formatBusinessNo(company.businessNo));
  const [aliases, setAliases] = useState(company.aliases.join(", "));
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionResult>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: "ok", text: "저장했습니다." });
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="signal-outline" size="sm">기업 편집</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>기업 편집</DialogTitle>
          <DialogDescription>{company.year}년 평가 · 사업자번호를 바꾸면 원천을 바로 다시 조회합니다.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending} className="flex flex-col gap-3 border-0 p-0">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name" className="text-[13px]">기업명</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-industry" className="text-[13px]">업종</Label>
              <Input id="edit-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="미분류" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-business-no" className="text-[13px]">사업자번호</Label>
              <Input id="edit-business-no" value={businessNo} onChange={(e) => setBusinessNo(e.target.value)} placeholder="000-00-00000" className="font-mono tabular-nums" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-aliases" className="text-[13px]">검색 별칭</Label>
            <textarea
              id="edit-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              rows={2}
              placeholder="쉼표 또는 줄바꿈으로 구분 — 일반명사·약칭이면 별칭을 더한다"
              className="border-[1.5px] border-hairline bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
            />
          </div>
        </fieldset>
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "border-l-2 border-risk bg-risk-surface px-3 py-2 text-[12.5px] text-risk" : "border-l-2 border-primary bg-accent px-3 py-2 text-[12.5px] text-accent-foreground"}>
            {message.text}
          </p>
        ) : null}
        <DialogFooter className="sm:justify-between">
          {company.isActive ? (
            confirming ? (
              <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => run(() => actions.setActive({ companyId: company.id, isActive: false }))}>정말 제외</Button>
            ) : (
              <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>분석 대상에서 제외</Button>
            )
          ) : (
            <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => run(() => actions.setActive({ companyId: company.id, isActive: true }))}>분석 대상으로 복귀</Button>
          )}
          <Button variant="signal" size="sm" disabled={pending} onClick={() => run(() => actions.edit({ companyId: company.id, name, industry, businessNo, aliases: splitAliases(aliases) }))}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run src/components/company/edit-company-dialog.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: 상세 페이지에 붙이기**

`src/app/companies/[id]/page.tsx` — import 두 줄 추가:

```ts
import { EditCompanyDialog } from "@/components/company/edit-company-dialog";
import { editCompanyAction, setCompanyActiveAction } from "@/app/companies/actions";
import { parseAliases } from "@/lib/services/collectForCompany";
```

헤더 우측 `<div className="flex items-center gap-3">` 안, `<RefreshSources … />` 앞에:

```tsx
<EditCompanyDialog
  company={{ id: company.id, year: company.year, name: company.name, industry: company.industry, businessNo: company.businessNo, aliases: parseAliases(company.aliases), isActive: company.isActive }}
  actions={{ edit: editCompanyAction, setActive: setCompanyActiveAction }}
/>
```

- [ ] **Step 10: 등록 다이얼로그 표에 제외·복귀 — 실패 테스트**

`src/components/layout/company-table.test.tsx` 에 추가 (파일 상단 mock 에 `useRouter` 가 없으면 추가):

```tsx
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

test("offers 제외 for active rows and 복귀 for excluded ones", async () => {
  const setActive = vi.fn(async () => ({ ok: true as const }));
  render(<CompanyTable companies={[company({ id: 1, name: "㈜가", isActive: true }), company({ id: 2, name: "㈜나", isActive: false })]} onSetActive={setActive} />);
  fireEvent.click(screen.getByRole("button", { name: "㈜가 제외" }));
  await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 1, isActive: false }));
  fireEvent.click(screen.getByRole("button", { name: "㈜나 복귀" }));
  await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 2, isActive: true }));
});
```

`company(...)` 팩토리가 그 테스트 파일에 없으면 `CompanyModel` 전체 필드를 채우는 팩토리를 파일 상단에 만든다:

```ts
const company = (patch: Partial<CompanyModel>): CompanyModel => ({
  id: 1, name: "㈜가", year: 2026, displayOrder: 0, isActive: true, businessNo: null, industry: null, officialName: null, sector: null, ceoName: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), aliases: null, ...patch,
});
```

- [ ] **Step 11: CompanyTable 구현**

`src/components/layout/company-table.tsx`:
- props 를 `{ companies, onSetActive }: { companies: CompanyModel[]; onSetActive?: (input: { companyId: number; isActive: boolean }) => Promise<{ ok: boolean; message?: string }> }` 로
- `import { useRouter } from "next/navigation";` · `const router = useRouter();`
- 상태 열 셀을 다음으로 교체:

```tsx
<td className="px-4 py-2.5">
  <span className={company.isActive ? "text-foreground" : "text-muted-foreground"}>{company.isActive ? "분석 대상" : "제외"}</span>
  {onSetActive ? (
    <button
      type="button"
      aria-label={`${company.name} ${company.isActive ? "제외" : "복귀"}`}
      onClick={async () => { const result = await onSetActive({ companyId: company.id, isActive: !company.isActive }); if (result.ok) router.refresh(); }}
      className="ml-2 border-[1.5px] border-hairline px-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
    >
      {company.isActive ? "제외" : "복귀"}
    </button>
  ) : null}
</td>
```

`src/components/company/register-dialog.tsx`: `import { setCompanyActiveAction } from "@/app/companies/actions";` 후 `<CompanyTable companies={companies} onSetActive={setCompanyActiveAction} />`.

- [ ] **Step 12: 통과 확인 + 전체 스위트**

Run: `npx vitest run src/components/layout src/components/company/register-dialog.test.tsx && npm test`
Expected: PASS

- [ ] **Step 13: 커밋**

```bash
git add src/app/companies/actions.ts src/app/companies/actions.test.ts src/components/company/edit-company-dialog.tsx src/components/company/edit-company-dialog.test.tsx src/components/layout/company-table.tsx src/components/layout/company-table.test.tsx src/components/company/register-dialog.tsx "src/app/companies/[id]/page.tsx"
git commit -m "feat(company): 기업 편집·제외를 화면에서 한다 — API 만 있던 수정 경로를 연다"
```

---

### Task 2: 배치 서버 완주 + 재구독 (H2 · M5)

**Files:**
- Modify: `src/lib/services/batchRegistry.ts`
- Modify: `src/lib/services/batchRegistry.test.ts`
- Create: `src/lib/services/batchSession.ts` + `batchSession.test.ts`
- Modify: `src/app/api/analyze/batch/route.ts`
- Create: `src/app/api/analyze/batch/events/route.ts`
- Create: `src/app/api/analyze/batch/abort/route.ts`
- Modify: `src/components/analysis/batch-runner.tsx` + `batch-runner.test.tsx`
- Modify: `src/components/layout/batch-indicator.tsx` + test
- Modify: `src/app/companies/page.tsx` (`resume` prop)

**Interfaces:**
- Consumes: `runBatch(targets, options, deps): AsyncGenerator<BatchEvent>` · `createSseSink` · `createSseParser`
- Produces (registry):
  ```ts
  export type BatchStatus = { stage: BatchStage; total: number; done: number; startedAt: string; current: string | null; aborting: boolean };
  export function publishBatchEvent(event: unknown): void;
  export function closeBatchStream(): void;
  export function subscribeBatch(listener: (event: unknown | null) => void): () => void;  // null = 끝
  export function requestAbort(): boolean;
  export function abortRequested(): boolean;
  export function hasBatchEvents(): boolean;
  ```
- Produces (session): `export function launchBatch(source: AsyncIterable<unknown>): Promise<void>`
- Produces (HTTP): `POST /api/analyze/batch → 202 { batch: BatchStatus }` · `GET /api/analyze/batch/events → text/event-stream` · `POST /api/analyze/batch/abort → 200 { aborting: boolean }`

- [ ] **Step 1: 레지스트리 실패 테스트**

`src/lib/services/batchRegistry.test.ts` — 기존 첫 테스트의 `toEqual` 에 `aborting: false` 를 더하고 아래를 추가:

```ts
import { abortRequested, closeBatchStream, hasBatchEvents, publishBatchEvent, requestAbort, subscribeBatch } from "@/lib/services/batchRegistry";

test("replays buffered events to a late subscriber, then streams new ones, then signals the end", () => {
  startBatch({ stage: "full", total: 1 });
  publishBatchEvent({ type: "batch_start", total: 1 });
  const seen: unknown[] = [];
  const unsubscribe = subscribeBatch((event) => seen.push(event));
  expect(seen).toEqual([{ type: "batch_start", total: 1 }]);
  publishBatchEvent({ type: "company_start", companyId: 1 });
  expect(seen).toHaveLength(2);
  finishBatch();
  closeBatchStream();
  expect(seen.at(-1)).toBeNull();
  unsubscribe();
});

test("a subscriber after the stream closed gets the replay and the end immediately; a new batch clears the buffer", () => {
  startBatch({ stage: "news", total: 1 });
  publishBatchEvent({ type: "batch_start", total: 1 });
  finishBatch();
  closeBatchStream();
  expect(hasBatchEvents()).toBe(true);
  const seen: unknown[] = [];
  subscribeBatch((event) => seen.push(event));
  expect(seen).toEqual([{ type: "batch_start", total: 1 }, null]);
  startBatch({ stage: "news", total: 2 });
  expect(hasBatchEvents()).toBe(false);
});

test("abort is a request flag on the running batch only", () => {
  expect(requestAbort()).toBe(false);
  startBatch({ stage: "full", total: 1 });
  expect(abortRequested()).toBe(false);
  expect(requestAbort()).toBe(true);
  expect(abortRequested()).toBe(true);
  expect(readBatch()).toMatchObject({ aborting: true });
  finishBatch();
  expect(abortRequested()).toBe(false);
});
```

`beforeEach` 는 `finishBatch` 와 `closeBatchStream` 을 둘 다 호출하도록 바꾼다: `beforeEach(() => { finishBatch(); closeBatchStream(); });`

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/batchRegistry.test.ts`
Expected: FAIL — `publishBatchEvent is not a function` 등

- [ ] **Step 3: 레지스트리 구현**

`src/lib/services/batchRegistry.ts` 전체:

```ts
export type BatchStage = "full" | "news" | "sources";
export type BatchStatus = { stage: BatchStage; total: number; done: number; startedAt: string; current: string | null; aborting: boolean };

type Listener = (event: unknown | null) => void;

let active: BatchStatus | null = null;
let events: unknown[] = [];
let streamOpen = false;
const listeners = new Set<Listener>();

/**
 * 진행 중 배치를 프로세스 메모리에 하나만 둔다. 관리자 한 명이 쓰는 도구라 인스턴스 간 공유는 하지 않는다.
 * 시작하면 이전 배치의 이벤트 버퍼를 비운다 — 재접속 화면이 옛 결과를 새 실행으로 오해하면 안 된다.
 */
export function startBatch(input: { stage: BatchStage; total: number; now?: Date }): BatchStatus {
  if (active) throw new Error("already_running");
  active = { stage: input.stage, total: input.total, done: 0, startedAt: (input.now ?? new Date()).toISOString(), current: null, aborting: false };
  events = [];
  streamOpen = true;
  return active;
}

export function advanceBatch(update: { done?: number; current?: string | null }): void {
  if (!active) return;
  active = { ...active, ...update };
}

export function finishBatch(): void {
  active = null;
}

export function readBatch(): BatchStatus | null {
  return active;
}

/**
 * 이벤트를 버퍼에 쌓고 구독자에게 바로 넘긴다. 버퍼는 늦게 붙은 화면이 처음부터 다시 그리는 데 쓴다.
 */
export function publishBatchEvent(event: unknown): void {
  events.push(event);
  for (const listener of listeners) listener(event);
}

/**
 * 스트림 끝을 알린다 — 구독자는 null 을 받고 연결을 닫는다. 버퍼는 다음 startBatch 까지 남는다.
 */
export function closeBatchStream(): void {
  streamOpen = false;
  for (const listener of listeners) listener(null);
  listeners.clear();
}

export function subscribeBatch(listener: Listener): () => void {
  for (const event of events) listener(event);
  if (!streamOpen) {
    listener(null);
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasBatchEvents(): boolean {
  return events.length > 0;
}

export function requestAbort(): boolean {
  if (!active) return false;
  active = { ...active, aborting: true };
  return true;
}

export function abortRequested(): boolean {
  return active?.aborting ?? false;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/batchRegistry.test.ts src/lib/services/batchRun.test.ts src/components/layout/app-shell.test.tsx src/components/layout/batch-indicator.test.tsx`
Expected: PASS. `app-shell.test.tsx` 의 `batch={{ stage:…, current: null }}` 리터럴에 `aborting: false` 를 더한다(타입 오류가 나면).

- [ ] **Step 5: 세션 실패 테스트**

`src/lib/services/batchSession.test.ts`:

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { closeBatchStream, finishBatch, startBatch, subscribeBatch } from "@/lib/services/batchRegistry";
import { launchBatch } from "@/lib/services/batchSession";

async function* source(events: unknown[], fail = false) {
  startBatch({ stage: "full", total: 1 });
  try {
    for (const event of events) yield event;
    if (fail) throw new Error("boom");
  } finally {
    finishBatch();
  }
}

describe("launchBatch", () => {
  beforeEach(() => { finishBatch(); closeBatchStream(); });

  test("publishes every event and closes the stream when the generator ends", async () => {
    const seen: unknown[] = [];
    await launchBatch(source([{ type: "batch_start" }, { type: "batch_done" }]));
    subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start" }, { type: "batch_done" }, null]);
  });

  test("a thrown error becomes an error event and still closes the stream", async () => {
    const seen: unknown[] = [];
    await launchBatch(source([{ type: "batch_start" }], true));
    subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start" }, { type: "error", message: "boom" }, null]);
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/lib/services/batchSession.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: 세션 구현**

`src/lib/services/batchSession.ts`:

```ts
import { closeBatchStream, publishBatchEvent } from "@/lib/services/batchRegistry";

/**
 * 배치 제너레이터를 끝까지 소비해 레지스트리에 발행한다. 호출자는 기다리지 않는다 — 요청은 202 로 먼저 돌아간다.
 * 예외는 error 이벤트로 바꿔 화면에 닿게 하고, 어떤 경우에도 스트림 끝을 알린다.
 */
export async function launchBatch(source: AsyncIterable<unknown>): Promise<void> {
  try {
    for await (const event of source) publishBatchEvent(event);
  } catch (caught) {
    publishBatchEvent({ type: "error", message: caught instanceof Error ? caught.message : "배치 실패" });
  } finally {
    closeBatchStream();
  }
}
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run src/lib/services/batchSession.test.ts`
Expected: PASS

- [ ] **Step 9: 라우트 세 개**

`src/app/api/analyze/batch/route.ts` — 스트림을 만들던 부분(`let sink … return new Response(stream, …)`)을 다음으로 교체하고 `createSseSink` import 를 지운다:

```ts
import { launchBatch } from "@/lib/services/batchSession";
import { abortRequested, readBatch } from "@/lib/services/batchRegistry";

  const userId = Number(session.user.id);
  const events = runBatch(targets, parsed.data, {
    userId,
    pipeline: defaultPipelineDeps(),
    collect: ({ query, aliases, ...options }) => collectForCompany({ name: query, aliases }, options),
    collectOnly: createCollectionRun,
    refreshSources: (target) => refreshSourcesFor(target.id),
    isOpen: () => !abortRequested(),
  });
  const first = await events.next();
  if (first.done) return Response.json({ message: "배치를 시작하지 못했습니다." }, { status: 500 });
  void launchBatch(prepend(first.value, events));
  return Response.json({ batch: readBatch() }, { status: 202 });
```

파일 하단에 헬퍼:

```ts
/**
 * 제너레이터의 첫 이벤트를 먼저 뽑아 startBatch 가 요청 안에서 실행되게 한다 — 그래야 202 응답의 batch 가 null 이 아니다.
 */
async function* prepend(first: unknown, rest: AsyncGenerator<unknown>): AsyncGenerator<unknown> {
  yield first;
  for await (const event of rest) yield event;
}
```

`src/app/api/analyze/batch/events/route.ts`:

```ts
import { auth } from "@/auth";
import { subscribeBatch } from "@/lib/services/batchRegistry";
import { createSseSink } from "@/lib/services/sse";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const sink = createSseSink(controller);
      const unsubscribe = subscribeBatch((event) => {
        if (event === null) sink.close();
        else sink.send(event);
      });
      cleanup = () => { unsubscribe(); sink.drop(); };
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
```

`src/app/api/analyze/batch/abort/route.ts`:

```ts
import { auth } from "@/auth";
import { requestAbort } from "@/lib/services/batchRegistry";

export async function POST() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  return Response.json({ aborting: requestAbort() });
}
```

- [ ] **Step 10: 러너 실패 테스트 갱신**

`src/components/analysis/batch-runner.test.tsx`:
- `fetchImpl` mock 을 메서드로 분기하는 헬퍼로 바꾼다:

```ts
function api(events: unknown[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/analyze/batch" && init?.method === "POST") return Response.json({ batch: { stage: "full", total: 1 } }, { status: 202 });
    if (url === "/api/analyze/batch/abort") return Response.json({ aborting: true });
    return sse(events);
  });
}
```

- 기존 "posts the options…" 테스트는 `const fetchImpl = api([...])` 로 바꾸고, 단언에 다음을 더한다:

```ts
expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/batch/events", expect.objectContaining({ cache: "no-store" }));
```

- 새 테스트 둘:

```tsx
test("resumes a running batch on mount without a click", async () => {
  const fetchImpl = api([{ type: "batch_start", total: 1, stage: "full" }, { type: "company_start", companyId: 1, name: "㈜가", index: 0 }]);
  render(<BatchRunner candidates={CANDIDATES} resume fetchImpl={fetchImpl} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
  expect(fetchImpl).not.toHaveBeenCalledWith("/api/analyze/batch", expect.objectContaining({ method: "POST" }));
});

test("중단 asks the server to stop and keeps reading until batch_done", async () => {
  const fetchImpl = api([
    { type: "batch_start", total: 2, stage: "full" },
    { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
    { type: "company_done", companyId: 1, status: "verified" },
    { type: "batch_done", done: 1, total: 2, aborted: true },
  ]);
  render(<BatchRunner candidates={CANDIDATES} resume fetchImpl={fetchImpl} />);
  await waitFor(() => expect(screen.getByText("중단됨")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
});
```

(두 번째 테스트에서 "중단" 클릭은 스트림이 동기적으로 끝나 잡기 어렵다 — 서버 요청 확인은 다음 단언으로 대신한다: 스트림 중 `중단` 버튼이 보이는 첫 테스트에서 `fireEvent.click(screen.getByRole("button", { name: "중단" }))` 후 `expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/batch/abort", expect.objectContaining({ method: "POST" }))`.)

- [ ] **Step 11: 실패 확인**

Run: `npx vitest run src/components/analysis/batch-runner.test.tsx`
Expected: FAIL — `resume` 무시, events 호출 없음

- [ ] **Step 12: 러너 구현**

`src/components/analysis/batch-runner.tsx` 변경점:

```tsx
export function BatchRunner({ candidates, preselected = [], initialStage = "full", resume = false, fetchImpl = fetch }: { …; resume?: boolean; fetchImpl?: typeof fetch }) {
```

`run`·`abort` 를 다음으로 교체하고 언마운트 effect 는 그대로 둔다(이제 구독만 끊는다):

```tsx
  async function subscribe() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetchImpl("/api/analyze/batch/events", { cache: "no-store", signal: controller.signal });
      if (!response.ok || !response.body) {
        setError(`진행 상태를 읽지 못했습니다 (${response.status})`);
        return;
      }
      const parser = createSseParser();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let current = INITIAL_BATCH;
      for (;;) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;
        for (const event of parser.push(value)) current = reduceBatch(current, event);
        setState(current);
      }
      if (current.phase === "done") router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  }

  async function run() {
    setError(null);
    setState(INITIAL_BATCH);
    const response = await fetchImpl("/api/analyze/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: [...selected], stage, limit, force, naver, google, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) }),
    });
    if (response.status !== 202) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? `실행 요청 실패 (${response.status})`);
      return;
    }
    await subscribe();
  }

  async function abort() {
    await fetchImpl("/api/analyze/batch/abort", { method: "POST" });
  }

  useEffect(() => {
    if (resume) void subscribe();
  }, []);
```

JSDoc 을 갱신한다: "실행 중에는 primary 버튼이 '중단' 하나뿐이다. 화면을 떠나도 서버는 완주하고, 다시 열면 이어서 본다."

`reduceBatch` 는 `{ type: "error" }` 를 이미 로그로 접는지 확인한다(`batchProgress.ts`). 없으면 `default:` 분기에서 `event.type === "error"` 일 때 `log(state, "error", event.message)` 를 반환하도록 추가한다.

- [ ] **Step 13: 페이지·배지**

`src/app/companies/page.tsx`: `import { hasBatchEvents, readBatch } from "@/lib/services/batchRegistry";` 후 BatchRunner 에 `resume={readBatch() !== null || hasBatchEvents()}` 를 넘기고, `<details open={preselected.length > 0 || readBatch() !== null}>` 로 바꾼다.

`src/components/layout/batch-indicator.tsx`: 바깥 `<span role="status">` 를 `<Link href="/companies#batch" role="status" …>` 로 바꾼다(`import Link from "next/link"`). 테스트에 `expect(screen.getByRole("status")).toHaveAttribute("href", "/companies#batch")` 추가.

- [ ] **Step 14: 통과 확인 + 전체 스위트**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 15: 커밋**

```bash
git add src/lib/services/batchRegistry.ts src/lib/services/batchRegistry.test.ts src/lib/services/batchSession.ts src/lib/services/batchSession.test.ts src/app/api/analyze/batch src/components/analysis/batch-runner.tsx src/components/analysis/batch-runner.test.tsx src/components/layout/batch-indicator.tsx src/components/layout/batch-indicator.test.tsx src/components/layout/app-shell.test.tsx src/app/companies/page.tsx src/lib/services/batchProgress.ts
git commit -m "feat(batch): 배치가 화면을 떠나도 완주한다 — 실행과 구독을 나누고 재접속하면 이어서 본다"
```

---

### Task 3: 로딩·오류·404 화면 (H3)

**Files:**
- Create: `src/app/loading.tsx` · `src/app/error.tsx` · `src/app/not-found.tsx`
- Create: `src/app/app-states.test.tsx`

- [ ] **Step 1: 실패 테스트**

`src/app/app-states.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Loading from "@/app/loading";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";

describe("app states", () => {
  test("loading announces itself to assistive tech", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  });

  test("error shows the message, a retry button and the digest", () => {
    const reset = vi.fn();
    render(<ErrorPage error={Object.assign(new Error("DB 연결 실패"), { digest: "abc123" })} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("DB 연결 실패");
    expect(screen.getByText("abc123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalled();
  });

  test("not-found links back to the company list", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "없는 페이지" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기업 목록으로" })).toHaveAttribute("href", "/companies");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/app/app-states.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

`src/app/loading.tsx`:

```tsx
/**
 * 절 머리 두 개 자리의 뼈대 — 동향 화면이 쿼리를 도는 동안 탭 클릭이 먹었다는 걸 보인다.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">불러오는 중</span>
      <div className="h-9 w-40 animate-pulse bg-surface" />
      <div className="border-t-4 border-ink pt-2.5">
        <div className="h-6 w-56 animate-pulse bg-surface" />
        <div className="mt-4 h-40 animate-pulse bg-surface" />
      </div>
      <div className="border-t-4 border-ink pt-2.5">
        <div className="h-6 w-48 animate-pulse bg-surface" />
        <div className="mt-4 h-24 animate-pulse bg-surface" />
      </div>
    </div>
  );
}
```

`src/app/error.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";

/**
 * 렌더 중 예외를 잡아 다시 시도 버튼과 digest 를 보인다 — 운영자가 로그에서 찾을 열쇠는 digest 뿐이다.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4 border-t-4 border-risk pt-3">
      <h1 className="font-display text-[28px] font-black tracking-[-0.03em]">화면을 그리지 못했습니다</h1>
      <p role="alert" className="border-l-2 border-risk bg-risk-surface px-3 py-2 text-[13px] text-risk">{error.message}</p>
      {error.digest ? <p className="font-mono text-[11.5px] text-muted-foreground">digest <span className="text-foreground">{error.digest}</span></p> : null}
      <Button variant="signal" className="self-start" onClick={reset}>다시 시도</Button>
    </div>
  );
}
```

`src/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-3 border-t-4 border-ink pt-3">
      <h1 className="font-display text-[28px] font-black tracking-[-0.03em]">없는 페이지</h1>
      <p className="text-[13px] text-muted-foreground">주소가 틀렸거나 기업이 제외·삭제됐습니다.</p>
      <Link href="/companies" className="self-start border-b border-primary text-[13px] font-bold text-primary">기업 목록으로</Link>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/app/app-states.test.tsx && npm run build`
Expected: PASS · 빌드 통과(not-found 가 정적으로 프리렌더될 때 layout 의 `readBatch()` 는 문제없다 — 순수 메모리 읽기)

- [ ] **Step 5: 커밋**

```bash
git add src/app/loading.tsx src/app/error.tsx src/app/not-found.tsx src/app/app-states.test.tsx
git commit -m "feat(app): 로딩·오류·404 화면을 둔다 — 클릭이 먹었는지, 무엇이 깨졌는지 보인다"
```

---

### Task 4: 기업명 검색 (H4)

**Files:**
- Modify: `src/lib/services/companyCards.ts:14,67-73` + `companyCards.test.ts`
- Modify: `src/components/company/company-card-grid.tsx` + test
- Modify: `src/components/ranking/ranking-table.tsx` + test

**Interfaces:**
- Produces: `CardFilter.query?: string` · `export function matchesQuery(name: string, query: string): boolean` (`companyCards.ts`)

- [ ] **Step 1: 실패 테스트 (서비스)**

`src/lib/services/companyCards.test.ts` 에 추가:

```ts
import { filterCards, matchesQuery } from "@/lib/services/companyCards";

test("matchesQuery ignores spaces and case", () => {
  expect(matchesQuery("㈜ 크립토 랩", "크립토랩")).toBe(true);
  expect(matchesQuery("Netlocks", "netlocks")).toBe(true);
  expect(matchesQuery("넷록스", "옥타코")).toBe(false);
  expect(matchesQuery("넷록스", "  ")).toBe(true);
});

test("filterCards narrows by query together with the flags", () => {
  const cards = [card(1, "크립토랩", false), card(2, "넷록스", true)];
  expect(filterCards(cards, { query: "넷" }).map((c) => c.id)).toEqual([2]);
  expect(filterCards(cards, { query: "넷", reviewOnly: true }).map((c) => c.id)).toEqual([2]);
  expect(filterCards(cards, { query: "크립", reviewOnly: true })).toEqual([]);
});
```

(`card` 팩토리가 그 파일에 없으면 `company-card-grid.test.tsx` 의 것을 복사한다.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/services/companyCards.test.ts`
Expected: FAIL — `matchesQuery` 미정의

- [ ] **Step 3: 서비스 구현**

`src/lib/services/companyCards.ts`:

```ts
export type CardFilter = { noticeOnly?: boolean; positiveOnly?: boolean; missingBusinessNo?: boolean; reviewOnly?: boolean; query?: string };

function fold(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * 띄어쓰기·대소문자를 무시하고 이름에 질의가 들어 있는지 본다. 빈 질의는 전부 통과다.
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = fold(query);
  return needle.length === 0 || fold(name).includes(needle);
}

export function filterCards(cards: CompanyCardData[], filter: CardFilter): CompanyCardData[] {
  return cards.filter((c) =>
    matchesQuery(c.name, filter.query ?? "") &&
    (!filter.noticeOnly || c.events30d.alert + c.events30d.notice > 0) &&
    (!filter.positiveOnly || c.events30d.positive > 0) &&
    (!filter.missingBusinessNo || !c.businessNo) &&
    (!filter.reviewOnly || c.needsReview),
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/services/companyCards.test.ts`
Expected: PASS

- [ ] **Step 5: 표 두 개 실패 테스트**

`src/components/company/company-card-grid.test.tsx` 에 추가:

```tsx
test("filters rows by the search box and resets the page", () => {
  const cards = Array.from({ length: 25 }, (_, i) => card(i + 1, i === 24 ? "옥타코" : `기업${i + 1}`, false));
  render(<CompanyCardGrid cards={cards} />);
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "옥타" } });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.queryByText("2 / 2")).not.toBeInTheDocument();
});
```

`src/components/ranking/ranking-table.test.tsx` 에 추가(파일의 행 팩토리를 그대로 쓴다):

```tsx
test("filters rows by the search box", () => {
  render(<RankingTable rows={[row({ companyId: 1, name: "옥타코" }), row({ companyId: 2, name: "넷록스" })]} industries={[]} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "기업명 검색" }), { target: { value: "넷" } });
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(screen.getByText("넷록스")).toBeInTheDocument();
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run src/components/company/company-card-grid.test.tsx src/components/ranking/ranking-table.test.tsx`
Expected: FAIL — searchbox 없음

- [ ] **Step 7: 표 구현**

`company-card-grid.tsx` 정렬 버튼 묶음 앞에:

```tsx
<input
  type="search"
  aria-label="기업명 검색"
  placeholder="기업명"
  value={filter.query ?? ""}
  onChange={(event) => { setFilter((prev) => ({ ...prev, query: event.target.value })); setPage(0); }}
  className="h-7 w-40 border-[1.5px] border-hairline bg-background px-2 text-[12px] focus-visible:border-ink focus-visible:outline-none"
/>
```

`ranking-table.tsx`: `const [query, setQuery] = useState("");` · `import { matchesQuery } from "@/lib/services/companyCards";` · `filtered` 조건에 `matchesQuery(row.name, query) &&` 추가 · `Segmented` 앞에 같은 `<input type="search" aria-label="기업명 검색" …>`(값·핸들러만 `query`/`setQuery`, `setPage(0)`).

- [ ] **Step 8: 통과 확인 · 커밋**

Run: `npm test`

```bash
git add src/lib/services/companyCards.ts src/lib/services/companyCards.test.ts src/components/company/company-card-grid.tsx src/components/company/company-card-grid.test.tsx src/components/ranking/ranking-table.tsx src/components/ranking/ranking-table.test.tsx
git commit -m "feat(list): 기업명으로 찾는다 — 띄어쓰기·대소문자를 무시하는 검색 상자"
```

---

### Task 5: 확인 필요 조치 피드백 (H5)

**Files:**
- Modify: `src/components/company/review-block.tsx:525-565`
- Modify: `src/components/company/review-block.test.tsx`

- [ ] **Step 1: 실패 테스트**

`review-block.test.tsx` 에 추가(기존 픽스처 `summary`·`actions` 를 쓴다. 없으면 `open_events` 항목 하나짜리 summary 를 만든다):

```tsx
test("disables the block while an action runs and confirms afterwards", async () => {
  let resolve!: (value: { ok: true }) => void;
  const confirmEvents = vi.fn(() => new Promise<{ ok: true }>((r) => { resolve = r; }));
  render(<ReviewBlock companyId={1} year={2026} summary={openEventsSummary} actions={{ ...actions, confirmEvents }} />);
  fireEvent.click(screen.getByRole("button", { name: "모두 확인" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "모두 확인" })).toBeDisabled());
  resolve({ ok: true });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다"));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/company/review-block.test.tsx -t "disables the block"`
Expected: FAIL — 버튼이 disabled 되지 않음

- [ ] **Step 3: 구현**

`ReviewBlock` 안:

```tsx
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run: Runner = (work, after) => {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) { setError(result.message); return; }
      after?.();
      setSaved("저장했습니다 · 화면을 다시 읽는 중");
      router.refresh();
    });
  };
```

본문 래퍼를 `<fieldset disabled={pending} className="flex flex-col border-0 p-0">` 로 바꾸고 `error` 문단 아래에:

```tsx
{saved ? <p role="status" className="border-l-2 border-primary bg-accent px-3 py-2 text-[12px] font-medium text-accent-foreground">{saved}</p> : null}
```

- [ ] **Step 4: 통과 확인 · 커밋**

Run: `npx vitest run src/components/company/review-block.test.tsx`

```bash
git add src/components/company/review-block.tsx src/components/company/review-block.test.tsx
git commit -m "fix(review): 조치 중에는 잠그고 끝나면 알린다 — 중복 클릭과 무응답을 없앤다"
```

---

## Phase 2 — 중간

### Task 6: 내비게이션이 평가연도를 유지 (M1)

**Files:**
- Modify: `src/components/layout/side-tabs.tsx`
- Modify: `src/components/layout/app-shell.tsx` + `app-shell.test.tsx`
- Modify: `src/app/reports/page.tsx`

**Interfaces:**
- Produces: `SideTabs({ year }: { year: string | null })` · `SideTabsFromUrl()` (searchParams 를 읽어 SideTabs 에 넘긴다)

- [ ] **Step 1: 실패 테스트**

`app-shell.test.tsx` 의 mock 을 확장:

```ts
const pathname = vi.fn(() => "/companies/28");
const search = vi.fn(() => new URLSearchParams("year=2025"));
vi.mock("next/navigation", () => ({ usePathname: () => pathname(), useSearchParams: () => search() }));
```

테스트 추가:

```tsx
test("carries the year in the URL into every tab", () => {
  render(<AppShell>본문</AppShell>);
  const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
  expect(within(nav).getByRole("link", { name: /동향/ })).toHaveAttribute("href", "/dashboard?year=2025");
  expect(within(nav).getByRole("link", { name: /리포트/ })).toHaveAttribute("href", "/reports?year=2025");
});

test("links plainly when the URL has no year", () => {
  search.mockReturnValueOnce(new URLSearchParams());
  render(<AppShell>본문</AppShell>);
  expect(within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("link", { name: /동향/ })).toHaveAttribute("href", "/dashboard");
});
```

기존 "shows the three places…" 테스트의 href 단언은 `?year=2025` 가 붙은 값으로 고친다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/layout/app-shell.test.tsx`

- [ ] **Step 3: 구현**

`side-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS = [ …그대로… ] as const;

/**
 * 서류철 색인 탭 — (기존 설명 유지). 연도는 URL 에서 받아 모든 탭에 붙인다 — 2025 를 보다가 탭을 누르면 2025 에 머문다.
 */
export function SideTabs({ year }: { year: string | null }) {
  const pathname = usePathname();
  const suffix = year ? `?year=${year}` : "";
  return (
    <nav …>
      {NAV_ITEMS.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={`${item.href}${suffix}`} …>…</Link>
        );
      })}
    </nav>
  );
}

export function SideTabsFromUrl() {
  const year = useSearchParams().get("year");
  return <SideTabs year={/^\d{4}$/.test(year ?? "") ? year : null} />;
}
```

`app-shell.tsx`: `import { Suspense } from "react";` · `import { SideTabs, SideTabsFromUrl } from "@/components/layout/side-tabs";` · aside 안을 `<Suspense fallback={<SideTabs year={null} />}><SideTabsFromUrl /></Suspense>` 로. (정적 프리렌더되는 `not-found` 에서 `useSearchParams` 가 CSR bailout 을 요구하므로 Suspense 가 필요하다.)

`src/app/reports/page.tsx`: 시그니처를 `ReportsPage({ searchParams }: PageProps<"/reports">)` 로, 연도 결정을 다른 페이지와 같게:

```ts
const params = await searchParams;
const years = await listYears();
const requested = Number(params.year);
const cohortYear = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());
```

헤더 우측에 `years.length > 1` 일 때 연도 nav 를 둔다 — `src/app/history/page.tsx:714-727` 의 마크업을 href 만 `/reports?year=${entry}` 로 바꿔 쓴다.

- [ ] **Step 4: 통과 확인 · 빌드 · 커밋**

Run: `npm test && npm run build`

```bash
git add src/components/layout/side-tabs.tsx src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx src/app/reports/page.tsx
git commit -m "feat(nav): 탭을 옮겨도 평가연도가 따라간다"
```

---

### Task 7: 표 상태를 URL 로 (M2)

**Files:**
- Create: `src/lib/hooks/useUrlState.ts` + `useUrlState.test.tsx`
- Modify: `src/components/company/company-card-grid.tsx` + test
- Modify: `src/components/ranking/ranking-table.tsx` + test
- Modify: `src/components/dashboard/event-table.tsx` + test

**Interfaces:**
- Produces:
  ```ts
  export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void]
  ```
  기본값과 같은 키는 URL 에서 지운다. 쓰기는 `router.replace(url, { scroll: false })`.

- [ ] **Step 1: 훅 실패 테스트**

`src/lib/hooks/useUrlState.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const replace = vi.fn();
const search = vi.fn(() => new URLSearchParams("year=2026&sort=name&page=2"));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/companies",
  useSearchParams: () => search(),
}));
import { useUrlState } from "@/lib/hooks/useUrlState";

describe("useUrlState", () => {
  test("reads present keys and falls back to defaults", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    expect(result.current[0]).toEqual({ sort: "name", page: "2", q: "" });
  });

  test("writes a patch, drops defaults, keeps unrelated params and does not scroll", () => {
    const { result } = renderHook(() => useUrlState({ sort: "triage", page: "0", q: "" }));
    act(() => result.current[1]({ sort: "triage", page: "0", q: "옥타" }));
    expect(replace).toHaveBeenCalledWith("/companies?year=2026&q=%EC%98%A5%ED%83%80", { scroll: false });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/hooks/useUrlState.test.tsx`

- [ ] **Step 3: 구현**

`src/lib/hooks/useUrlState.ts`:

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * 표의 정렬·필터·페이지를 URL 쿼리에 둔다 — 상세에 갔다 돌아와도, 새로고침해도 그 자리다.
 * 기본값과 같은 키는 지워 URL 을 짧게 유지하고, 다른 키(year 등)는 건드리지 않는다.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state = useMemo(() => {
    const next = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const value = params.get(String(key));
      if (value !== null) next[key] = value as T[keyof T];
    }
    return next;
  }, [defaults, params]);

  const set = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries({ ...state, ...patch })) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [defaults, params, pathname, router, state],
  );

  return [state, set];
}
```

`defaults` 는 호출자가 모듈 상수로 둔다(렌더마다 새 객체면 `useMemo` 가 매번 다시 돈다).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/hooks/useUrlState.test.tsx`

- [ ] **Step 5: 표 세 개에 적용 — 실패 테스트**

세 테스트 파일 상단에 같은 mock 을 둔다(기존 `next/navigation` mock 이 있으면 합친다):

```ts
const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/x", useSearchParams: () => search }));
```

각 파일에 테스트 하나씩:

```tsx
test("reads its state from the URL and writes changes back", () => {
  search = new URLSearchParams("sort=name");
  render(<CompanyCardGrid cards={[card(1, "나", false), card(2, "가", false)]} />);
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("가");
  fireEvent.click(screen.getByRole("checkbox", { name: "확인 필요만" }));
  expect(replace).toHaveBeenCalledWith(expect.stringContaining("review=1"), { scroll: false });
});
```

랭킹: `search = new URLSearchParams("industry=ICT")` 로 열어 필터가 적용됐는지, `정렬` 라디오 "기업명" 클릭이 `sort=name` 을 쓰는지. 사건 표: `search = new URLSearchParams("period=90")` 로 열어 90일 라디오가 선택됐는지, "미확인만" 클릭이 `open=1` 을 쓰는지.

**주의:** 기존 페이징·필터 테스트는 `replace` 가 mock 이라 URL 이 실제로 바뀌지 않는다. 그 테스트들은 `search` 를 바꿔 다시 렌더하는 방식으로 고쳐 쓴다 — 예: "다음" 클릭 후 `expect(replace).toHaveBeenCalledWith(expect.stringContaining("page=1"), …)` 로 단언을 바꾼다.

- [ ] **Step 6: 표 구현**

`company-card-grid.tsx`:

```tsx
const DEFAULTS = { sort: "triage", q: "", review: "", notice: "", positive: "", nobn: "", page: "0" } as const;
type UrlState = { [K in keyof typeof DEFAULTS]: string };

export function CompanyCardGrid({ cards, initialFilter = {} }: …) {
  const [url, setUrl] = useUrlState<UrlState>(DEFAULTS);
  const sort = (["triage", "name", "news"] as CardSort[]).includes(url.sort as CardSort) ? (url.sort as CardSort) : "triage";
  const filter: CardFilter = {
    query: url.q,
    reviewOnly: url.review === "1" || (initialFilter.reviewOnly ?? false),
    noticeOnly: url.notice === "1",
    positiveOnly: url.positive === "1",
    missingBusinessNo: url.nobn === "1",
  };
  const page = Number(url.page) || 0;
  …
```

각 핸들러는 `setUrl({ review: checked ? "1" : "", page: "0" })` 꼴로, `Pager` 의 `onPage={(p) => setUrl({ page: String(p) })}`. `useState` 세 개와 `useMemo` 의존성은 제거한다. `initialFilter` prop 은 `/companies?filter=review` 링크 호환을 위해 남긴다.

`ranking-table.tsx`: `DEFAULTS = { sort: "rank", industry: "", q: "", page: "0" }`. `event-table.tsx`: `DEFAULTS = { period: "30", open: "", page: "0" }` — `hiddenKinds` 는 그대로 `useState` 로 둔다(집합이라 URL 에 넣을 가치가 낮다).

- [ ] **Step 7: 통과 확인 · 커밋**

Run: `npm test`

```bash
git add src/lib/hooks src/components/company/company-card-grid.tsx src/components/company/company-card-grid.test.tsx src/components/ranking/ranking-table.tsx src/components/ranking/ranking-table.test.tsx src/components/dashboard/event-table.tsx src/components/dashboard/event-table.test.tsx
git commit -m "feat(list): 정렬·필터·페이지를 URL 에 둔다 — 돌아와도 그 자리"
```

---

### Task 8: 이전·다음 기업 + 사건 앵커 (M3)

**Files:**
- Modify: `src/lib/repositories/companyRepository.ts` + test
- Modify: `src/app/companies/[id]/page.tsx`
- Modify: `src/components/company/event-timeline.tsx` + test
- Modify: `src/components/dashboard/event-table.tsx` + test

**Interfaces:**
- Produces: `export async function listNeighbours(companyId: number): Promise<{ prev: { id: number; name: string } | null; next: { id: number; name: string } | null }>` — 같은 연도·활성 기업을 `displayOrder, id` 순으로 본 이웃

- [ ] **Step 1: 저장소 실패 테스트**

`companyRepository.test.ts` 에:

```ts
describe("listNeighbours", () => {
  beforeEach(resetDatabase);
  it("walks the active companies of the same year in display order", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2026, displayOrder: 0 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2026, displayOrder: 1, isActive: false } });
    const c = await prisma.company.create({ data: { name: "다", year: 2026, displayOrder: 2 } });
    await prisma.company.create({ data: { name: "라", year: 2025, displayOrder: 3 } });
    expect(await listNeighbours(a.id)).toEqual({ prev: null, next: { id: c.id, name: "다" } });
    expect(await listNeighbours(c.id)).toEqual({ prev: { id: a.id, name: "가" }, next: null });
    expect(await listNeighbours(b.id)).toEqual({ prev: { id: a.id, name: "가" }, next: { id: c.id, name: "다" } });
  });
});
```

- [ ] **Step 2: 실패 확인 · 구현**

```ts
/**
 * 상세 화면의 이전·다음 — 같은 연도의 활성 기업을 등록 순서로 본 이웃이다. 제외된 기업에서 열어도 활성 이웃을 준다.
 */
export async function listNeighbours(companyId: number) {
  const current = await prisma.company.findUnique({ where: { id: companyId }, select: { year: true, displayOrder: true, id: true } });
  if (!current) return { prev: null, next: null };
  const rows = await prisma.company.findMany({
    where: { year: current.year, OR: [{ isActive: true }, { id: companyId }] },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const index = rows.findIndex((row) => row.id === companyId);
  return { prev: rows[index - 1] ?? null, next: rows[index + 1] ?? null };
}
```

Run: `npx vitest run src/lib/repositories/companyRepository.test.ts` → PASS

- [ ] **Step 3: 상세 헤더·타임라인 앵커**

`src/app/companies/[id]/page.tsx`: `const neighbours = await listNeighbours(company.id);` 후 헤더 우측 `<div className="flex items-center gap-3">` 맨 앞에:

```tsx
<nav aria-label="기업 이동" className="flex items-center gap-2 text-[12px]">
  {neighbours.prev ? <Link href={`/companies/${neighbours.prev.id}`} className="underline-offset-2 hover:underline">← {neighbours.prev.name}</Link> : <span className="text-muted-foreground/45">← 처음</span>}
  <span className="text-hairline">|</span>
  {neighbours.next ? <Link href={`/companies/${neighbours.next.id}`} className="underline-offset-2 hover:underline">{neighbours.next.name} →</Link> : <span className="text-muted-foreground/45">마지막 →</span>}
</nav>
```

사건 이력 Panel 에 `id="events"`·`className="scroll-mt-20"`. `event-timeline.tsx` 의 `<tr key={event.id}>` 에 `id={`event-${event.id}`}` 와 `className="… scroll-mt-24 target:bg-accent"`.

`event-table.tsx` 의 기업 링크는 그대로 두고 사건 제목 셀을 링크로: `<Link href={`/companies/${row.event.companyId}#event-${row.event.id}`} className="hover:underline">{row.event.title}</Link>`.

테스트: `event-timeline.test.tsx` 에 `expect(container.querySelector("#event-7")).not.toBeNull()`, `event-table.test.tsx` 에 `expect(screen.getByRole("link", { name: "투자 유치" })).toHaveAttribute("href", "/companies/1#event-7")` (픽스처의 id·제목에 맞춘다).

- [ ] **Step 4: 통과 확인 · 커밋**

```bash
git add src/lib/repositories/companyRepository.ts src/lib/repositories/companyRepository.test.ts "src/app/companies/[id]/page.tsx" src/components/company/event-timeline.tsx src/components/company/event-timeline.test.tsx src/components/dashboard/event-table.tsx src/components/dashboard/event-table.test.tsx
git commit -m "feat(company): 상세에서 이전·다음으로 넘기고 사건 링크는 그 사건으로 간다"
```

---

### Task 9: 동향 CTA 딥링크 (M4)

**Files:**
- Modify: `src/app/dashboard/page.tsx:155-162`

- [ ] **Step 1: 구현**

`verdicts.companies` 에서 `verdict === "pending"` 인 `companyId` 를 모아 링크를 만든다:

```tsx
const pendingIds = verdicts.companies.filter((entry) => entry.verdict === "pending").map((entry) => entry.companyId);
…
{pendingIds.length > 0 ? (
  <Link href={`/companies?year=${year}&run=${pendingIds.join(",")}&stage=full#batch`} …>미분석 {pendingIds.length}개사 실행</Link>
) : null}
```

`src/components/dashboard/pipeline-band.test.tsx` 나 대시보드 통합 테스트가 이 문구를 단언하면 "실행" 으로 고친다.

- [ ] **Step 2: 확인 · 커밋**

Run: `npm test`

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): 미분석 링크가 실행 패널까지 간다 — 대상이 골라진 채 열린다"
```

---

### Task 10: 다운로드 생성 중 표시 (M6)

**Files:**
- Create: `src/components/ui/download-link.tsx` + test
- Modify: `src/app/ranking/page.tsx:262-267` · `src/components/reports/run-history-table.tsx:629-633` · `src/components/reports/monthly-doc-list.tsx` · `src/app/dashboard/page.tsx:147-152`

**Interfaces:**
- Produces: `DownloadLink({ href, children, className, fetchImpl }: { href: string; children: ReactNode; className?: string; fetchImpl?: typeof fetch })`

- [ ] **Step 1: 실패 테스트**

`src/components/ui/download-link.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DownloadLink } from "@/components/ui/download-link";

describe("DownloadLink", () => {
  test("fetches the file, shows 생성 중, saves it under the server's filename", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(["x"]), { headers: { "Content-Disposition": "attachment; filename*=UTF-8''%EC%9B%94%EA%B0%84.xlsx" } }));
    const createObjectURL = vi.fn(() => "blob:1");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DownloadLink href="/api/reports/monthly?year=2026&month=9" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    expect(screen.getByRole("button")).toHaveTextContent("생성 중…");
    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("월간.xlsx");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("엑셀"));
  });

  test("shows the failure inline", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    render(<DownloadLink href="/x" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("생성 실패 (500)"));
  });
});
```

- [ ] **Step 2: 실패 확인 · 구현**

`src/components/ui/download-link.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";

function filenameOf(header: string | null, fallback: string) {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/);
  if (star) return decodeURIComponent(star[1]);
  const plain = header?.match(/filename="?([^";]+)"?/);
  return plain ? plain[1] : fallback;
}

/**
 * 워크북을 받는 링크 — 서버가 만드는 몇 초 동안 "생성 중…" 을 보이고 재클릭을 막는다.
 * 파일명은 서버의 Content-Disposition 을 그대로 쓴다.
 */
export function DownloadLink({ href, children, className = "", fetchImpl = fetch }: { href: string; children: ReactNode; className?: string; fetchImpl?: typeof fetch }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchImpl(href);
      if (!response.ok) {
        setError(`생성 실패 (${response.status})`);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameOf(response.headers.get("Content-Disposition"), "download.xlsx");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(`생성 실패 — ${caught instanceof Error ? caught.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={download} disabled={busy} aria-busy={busy} className={className}>
        {busy ? "생성 중…" : children}
      </button>
      {error ? <span role="alert" className="text-[11.5px] font-medium text-risk">{error}</span> : null}
    </span>
  );
}
```

- [ ] **Step 3: 네 곳 교체**

- 랭킹 "엑셀 내보내기" `<a href={exportHref} …>` → `<DownloadLink href={exportHref} className="…같은 클래스…">엑셀 내보내기</DownloadLink>`
- 실행 이력 표 "엑셀" `<a>` → `<DownloadLink href={`/api/reports/${row.id}`} className="…">엑셀</DownloadLink>`
- 월간 문서 목록 `<a>` → `<DownloadLink … className="flex w-full items-baseline justify-between …">` (`monthly-doc-list.tsx` 는 서버 컴포넌트지만 클라이언트 컴포넌트를 렌더할 수 있다)
- 동향 밴드의 "이번 달·지난 달" `<a>` → `DownloadLink`

관련 테스트에서 `getByRole("link", { name: "엑셀" })` 은 `getByRole("button", …)` 으로 바꾼다.

- [ ] **Step 4: 확인 · 커밋**

```bash
git add src/components/ui/download-link.tsx src/components/ui/download-link.test.tsx src/app/ranking/page.tsx src/components/reports src/app/dashboard/page.tsx
git commit -m "feat(reports): 워크북을 받는 동안 생성 중을 보인다 — 재클릭을 막는다"
```

---

## Phase 3 — 낮음

### Task 11: 로그아웃 (L1)

**Files:**
- Create: `src/app/actions.ts`
- Create: `src/components/layout/sign-out-form.tsx` + test
- Modify: `src/components/layout/app-shell.tsx` · `src/app/layout.tsx`

- [ ] **Step 1: 실패 테스트**

`src/components/layout/sign-out-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SignOutForm } from "@/components/layout/sign-out-form";

describe("SignOutForm", () => {
  test("is a form posting to the given action with a labelled button", () => {
    const action = vi.fn();
    render(<SignOutForm action={action} />);
    const button = screen.getByRole("button", { name: "로그아웃" });
    expect(button.closest("form")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 구현**

`src/app/actions.ts`:

```ts
"use server";

import { signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
```

`src/components/layout/sign-out-form.tsx`:

```tsx
export function SignOutForm({ action }: { action: () => void | Promise<void> }) {
  return (
    <form action={action}>
      <button type="submit" className="border-[1.5px] border-band-foreground/30 px-2 py-1 text-[11px] font-bold text-band-foreground transition-colors hover:border-band-foreground/70">
        로그아웃
      </button>
    </form>
  );
}
```

`app-shell.tsx`: prop `account?: ReactNode` 추가, `<ThemeToggle />` 뒤에 `{account}`. `ThemeToggle` 의 `ml-auto` 는 BatchIndicator 가 이미 `ml-auto` 라 그대로 둔다.

`src/app/layout.tsx`: `import { signOutAction } from "@/app/actions";` · `import { SignOutForm } from "@/components/layout/sign-out-form";` · `<AppShell batch={readBatch()} account={<SignOutForm action={signOutAction} />}>`.

로그인 화면은 `AppShell` 안에서 렌더된다(layout 공용). 로그인 전에 로그아웃 버튼이 보이는 게 어색하면 `layout.tsx` 에서 `await auth()` 로 세션이 있을 때만 `account` 를 넘긴다 — `auth()` 는 layout 에서 호출 가능하다.

- [ ] **Step 3: 확인 · 커밋**

```bash
git add src/app/actions.ts src/components/layout/sign-out-form.tsx src/components/layout/sign-out-form.test.tsx src/components/layout/app-shell.tsx src/app/layout.tsx
git commit -m "feat(auth): 헤더에서 로그아웃한다"
```

---

### Task 12: 날짜에 연도를 붙인다 — 다른 해일 때만 (L2)

**Files:**
- Modify: `src/lib/services/kst.ts` + `kst.test.ts`
- Modify: `src/components/company/company-row.tsx` · `src/components/dashboard/event-table.tsx`

- [ ] **Step 1: 실패 테스트**

```ts
import { kstDateShort } from "@/lib/services/kst";

test("kstDateShort drops the year only inside the current year", () => {
  const now = new Date("2026-09-02T00:00:00Z");
  expect(kstDateShort("2026-03-01T15:00:00Z", now)).toBe("03-02");
  expect(kstDateShort("2025-12-31T15:00:00Z", now)).toBe("2026-01-01");
  expect(kstDateShort("2025-06-01T00:00:00Z", now)).toBe("2025-06-01");
});
```

- [ ] **Step 2: 구현**

```ts
/**
 * 올해면 `MM-DD`, 다른 해면 `YYYY-MM-DD` — 코호트 화면에서 해가 넘어간 날짜가 올해 것으로 읽히지 않게.
 */
export function kstDateShort(iso: string, now: Date = new Date()): string {
  const parts = kstParts(iso);
  if (!parts) return iso.slice(0, 10);
  const thisYear = kstParts(now.toISOString())?.year;
  return parts.year === thisYear ? `${parts.month}-${parts.day}` : `${parts.year}-${parts.month}-${parts.day}`;
}
```

`company-row.tsx`·`event-table.tsx` 의 `kstMonthDay(x)` 를 `kstDateShort(x, now)` 로 바꾼다(둘 다 `now` prop 이 있다). `kstMonthDay` 는 다른 호출처가 남아 있으면 유지한다.

- [ ] **Step 3: 확인 · 커밋**

```bash
git add src/lib/services/kst.ts src/lib/services/kst.test.ts src/components/company/company-row.tsx src/components/dashboard/event-table.tsx
git commit -m "fix(date): 다른 해의 날짜에는 연도를 붙인다"
```

---

### Task 13: 검증 근거 패널 닫기·포커스 + 사건 제목 줄바꿈 (L3)

**Files:**
- Modify: `src/components/company/verification-panel.tsx` + test
- Modify: `src/components/dashboard/event-table.tsx` · `src/components/company/event-timeline.tsx`

- [ ] **Step 1: 실패 테스트**

`verification-panel.test.tsx` 에:

```tsx
test("opens as a dialog, focuses 닫기, closes on Escape and on the overlay", () => {
  render(<VerificationPanel layers={LAYERS} />);
  fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
  const dialog = screen.getByRole("dialog", { name: "검증 근거" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "닫기" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
  fireEvent.click(screen.getByTestId("verification-overlay"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "검증 근거 열기" }));
});
```

- [ ] **Step 2: 구현**

`verification-panel.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
…
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
```

트리거 `<button ref={trigger} …>`. 열렸을 때:

```tsx
<>
  <div data-testid="verification-overlay" onClick={close} className="fixed inset-0 z-20 bg-ink/30" />
  <aside role="dialog" aria-modal="true" aria-label="검증 근거" className="fixed inset-y-0 right-0 z-30 …">
    … <button ref={closeButton} type="button" onClick={close} …>닫기</button>
```

사건 제목: `event-table.tsx`·`event-timeline.tsx` 의 제목 셀에서 `truncate whitespace-nowrap` 을 지우고 `min-w-[240px] max-w-[420px] break-keep` 으로, `title` 속성은 지운다. 근거 셀은 그대로 둔다(링크 라벨은 짧다).

- [ ] **Step 3: 확인 · 커밋**

```bash
git add src/components/company/verification-panel.tsx src/components/company/verification-panel.test.tsx src/components/dashboard/event-table.tsx src/components/company/event-timeline.tsx
git commit -m "fix(a11y): 검증 근거 패널이 Esc·바깥 클릭으로 닫히고 사건 제목은 잘리지 않는다"
```

---

### Task 14: 용어 설명 (L4)

**Files:**
- Modify: `src/components/dashboard/section-head.tsx` + `design-primitives.test.tsx`
- Modify: `src/components/company/company-row.tsx` · `company-card-grid.tsx`
- Modify: `src/components/company/evidence-grid.tsx` (`EvidenceStrip` 아래 `StateLegend`)

- [ ] **Step 1: 실패 테스트**

`design-primitives.test.tsx` 에:

```tsx
test("SectionHead explains what the tag means on hover", () => {
  render(<SectionHead title="x" tag="실측" />);
  expect(screen.getByText("실측")).toHaveAttribute("title", "원천·기사에서 그대로 읽은 값");
});
```

`company-card-grid.test.tsx` 에:

```tsx
test("explains the terse column names", () => {
  render(<CompanyCardGrid cards={[card(1, "가", false)]} />);
  expect(screen.getByRole("columnheader", { name: "미확인" })).toHaveAttribute("title", "확인하지 않은 경보·주의 사건 수");
  expect(screen.getByRole("columnheader", { name: "신뢰" })).toHaveAttribute("title", "최신 분석의 검증 판정");
});
```

`evidence-grid.test.tsx` 에: `render(<EvidenceStrip snapshots={[]} />)` 후 `expect(screen.getByText("결측")).toBeInTheDocument()` 와 범례 텍스트(`StateLegend` 가 내는 문구) 단언.

- [ ] **Step 2: 구현**

`section-head.tsx`:

```ts
const TAG_HINT: Record<string, string> = {
  "실측": "원천·기사에서 그대로 읽은 값",
  "분석 산출": "LLM 분석이 만든 값 — 검증 판정을 함께 본다",
  "생성형": "요청할 때마다 새로 만든다",
  "실시간": "지금 저장된 값으로 다시 계산한 결과",
  "확정 기록": "시상 확정 당시 값 그대로",
  "자동 산출": "규칙으로 계산 — 사람이 정하지 않았다",
  "기록": "운영자가 남긴 파일·메모",
};
```

태그 `<span title={TAG_HINT[tag]} …>`.

`company-row.tsx`:

```ts
export const COMPANY_COLUMNS = ["심각도", "기업", "신뢰", "업종", "가입자", "수상·투자·긍정", "주의", "최근 보도", "미확인"] as const;
export const COLUMN_HINT: Partial<Record<(typeof COMPANY_COLUMNS)[number], string>> = {
  "신뢰": "최신 분석의 검증 판정",
  "가입자": "국민연금 가입자 수 · 12개월 증감",
  "수상·투자·긍정": "지난 30일 긍정 사건 수",
  "주의": "지난 30일 주의·경보 사건 수",
  "미확인": "확인하지 않은 경보·주의 사건 수",
};
```

`company-card-grid.tsx` 의 `<th … title={COLUMN_HINT[column]}>`.

`evidence-grid.tsx` 의 `EvidenceStrip` 반환을 `<div className="flex flex-col gap-2"><ul …>…</ul><StateLegend /></div>` 로.

- [ ] **Step 3: 확인 · 커밋**

```bash
git add src/components/dashboard/section-head.tsx src/components/dashboard/design-primitives.test.tsx src/components/company/company-row.tsx src/components/company/company-card-grid.tsx src/components/company/company-card-grid.test.tsx src/components/company/evidence-grid.tsx src/components/company/evidence-grid.test.tsx
git commit -m "docs(ui): 절 태그·열 이름·빈칸 종류에 설명을 단다"
```

---

### Task 15: 등록 결과 안내가 URL 에 남지 않게 (L5)

**Files:**
- Modify: `src/components/company/register-dialog.tsx` + test

- [ ] **Step 1: 실패 테스트**

`register-dialog.test.tsx` (mock: `const replace = vi.fn(); vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))`):

```tsx
test("closing the dialog after a notice strips it from the URL", () => {
  render(<RegisterDialog year={2026} companies={[]} action={vi.fn()} notice="3건 등록" />);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  expect(replace).toHaveBeenCalledWith("/companies?year=2026", { scroll: false });
});
```

- [ ] **Step 2: 구현**

```tsx
import { useRouter } from "next/navigation";
…
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(notice));
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && notice) router.replace(`/companies?year=${year}`, { scroll: false });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
```

(`defaultOpen` 을 제거하고 제어 컴포넌트로 바꾼다.)

- [ ] **Step 3: 확인 · 커밋**

```bash
git add src/components/company/register-dialog.tsx src/components/company/register-dialog.test.tsx
git commit -m "fix(register): 등록 안내를 닫으면 URL 에서도 지운다"
```

---

## 마무리

- [ ] `npm test && npm run lint && npm run build` 전부 통과
- [ ] `./scripts/dev.sh` 로 띄워 손으로 확인: (1) 상세에서 이름 바꾸고 제외·복귀 (2) 5개사 배치 실행 중 동향 탭으로 갔다가 돌아오기 → 이어서 보이는지, 헤더 배지 클릭 (3) 존재하지 않는 `/companies/999999` (4) 기업 목록 검색 후 상세 갔다가 뒤로 → 검색어 유지 (5) 월간 문서 클릭 → "생성 중…" 뒤 파일
- [ ] `CLAUDE.md` 의 "남은 것" 문단에 이 플랜 완료를 한 줄 적고, `docs/superpowers/plans/2026-09-02-next-session.md` §3 에 "배치 레지스트리 DB 이관 시 `subscribeBatch`/`publishBatchEvent` 인터페이스 유지" 를 남긴다

## 자체 점검 (작성 시)

- 스펙 대조: H1→T1 · H2→T2 · H3→T3 · H4→T4 · H5→T5 · M1→T6 · M2→T7 · M3→T8 · M4→T9 · M5→T2(resume) · M6→T10 · L1→T11 · L2→T12 · L3→T13 · L4→T14 · L5→T15. 누락 없음
- 타입 일관성: `BatchStatus.aborting` 은 T2 에서 정의하고 `app-shell.test.tsx` 픽스처를 같은 태스크에서 고친다. `ActionResult` 는 `[id]/actions.ts` 의 것을 T1 이 import 한다. `matchesQuery` 는 T4 에서 정의하고 랭킹 표가 같은 태스크에서 쓴다. `useUrlState` 는 T7 안에서 정의·사용된다
- 순서 의존: T7 은 T4 의 검색 상자를 URL 로 옮기므로 T4 뒤에 한다. T9 는 T2 의 `resume`·`open` 과 무관하게 동작한다. 나머지는 독립이다
