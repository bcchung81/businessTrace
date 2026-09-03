import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/dashboard/actions", () => ({
  loadReviewItemsAction: vi.fn(),
  confirmCompanyEventsAction: vi.fn(),
  markVerificationsReviewedAction: vi.fn(),
}));
vi.mock("@/app/companies/[id]/actions", () => ({
  decideNpsAction: vi.fn(),
  holdNpsAction: vi.fn(),
  decideDartAction: vi.fn(),
  decideFscAction: vi.fn(),
  reviewVerificationAction: vi.fn(),
  confirmEventsAction: vi.fn(),
  saveAliasesAction: vi.fn(),
  saveBusinessNoAction: vi.fn(),
}));

import { TodoDialog, type TodoKind, type TodoRow } from "@/components/dashboard/todo-dialog";
import type { ReviewActions } from "@/components/company/review-block";
import type { ReviewSummary } from "@/lib/repositories/reviewItems";

const ROWS: TodoRow[] = [
  { companyId: 5, name: "㈜가", note: "미확인 경보·주의 2", selectable: true },
  { companyId: 9, name: "㈜나", note: "사업자번호 미확보", selectable: false },
  { companyId: 11, name: "㈜다", note: "미확인 경보·주의 1", selectable: true },
];

const OPEN_EVENTS: ReviewSummary = {
  items: [{ kind: "open_events", events: [{ id: 21, occurredAt: "2026-08-27T00:00:00.000Z", severity: "alert", kind: "closure", title: "폐업", evidence: [] }] }],
  lastDecidedAt: null,
};
const NOTHING_LEFT: ReviewSummary = { items: [], lastDecidedAt: null };
const ONE_LEFT: ReviewSummary = {
  items: [{ kind: "open_events", events: [{ id: 22, occurredAt: "2026-08-26T00:00:00.000Z", severity: "notice", kind: "headcount_down", title: "인원 감소", evidence: [] }] }],
  lastDecidedAt: null,
};

type Load = (companyId: number) => Promise<{ ok: true; summary: ReviewSummary | null } | { ok: false; message: string }>;

type Bulk = (companyIds: number[], opened: number[]) => Promise<{ ok: true; done: number } | { ok: false; message: string }>;

function mockActions(): ReviewActions {
  const ok = async () => ({ ok: true as const });
  return {
    decideNps: vi.fn(ok),
    holdNps: vi.fn(ok),
    decideDart: vi.fn(ok),
    decideFsc: vi.fn(ok),
    reviewVerification: vi.fn(ok),
    confirmEvents: vi.fn(ok),
    saveAliases: vi.fn(ok),
    saveBusinessNo: vi.fn(ok),
  };
}

const TEXT = "확인 필요 3개사";

function setup(options: { kind?: TodoKind; bulk?: Bulk; summaries?: Record<number, ReviewSummary>; load?: Load } = {}) {
  const load = vi.fn<Load>(options.load ?? (async (companyId: number) => ({ ok: true as const, summary: options.summaries?.[companyId] ?? OPEN_EVENTS })));
  const bulk = vi.fn<Bulk>(options.bulk ?? (async () => ({ ok: true as const, done: 2 })));
  render(<TodoDialog text={TEXT} kind={options.kind ?? "review"} rows={ROWS} year={2026} load={load} bulk={bulk} actions={mockActions()} />);
  fireEvent.click(screen.getByRole("button", { name: TEXT }));
  return { load, bulk };
}

describe("TodoDialog", () => {
  test("opens the list in place instead of navigating away", () => {
    setup();
    expect(screen.getByRole("dialog", { name: TEXT })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "처리할 기업" })).toBeInTheDocument();
    for (const row of ROWS) {
      expect(screen.getByRole("button", { name: `${row.name} 열기` })).toBeInTheDocument();
      expect(screen.getByText(row.note)).toBeInTheDocument();
    }
    expect(screen.getByText(/왼쪽에서 기업을 고르면/)).toBeInTheDocument();
  });

  test("every row keeps a way out to the full screen, carrying the queue it belongs to", () => {
    setup();
    expect(screen.getByRole("link", { name: "㈜가 상세" })).toHaveAttribute("href", "/companies/5?queue=review");
  });

  test("the verification queue points its rows at the verification queue", () => {
    setup({ kind: "verification" });
    expect(screen.getByRole("link", { name: "㈜나 상세" })).toHaveAttribute("href", "/companies/9?queue=verification");
  });

  test("picking a company loads its review items into the right pane", async () => {
    const { load } = setup();
    fireEvent.click(screen.getByRole("button", { name: "㈜가 열기" }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(5));
    expect(await screen.findByRole("checkbox", { name: "폐업" })).toBeInTheDocument();
    expect(screen.getByText("미확인 사건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "㈜가 열기" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "㈜나 열기" })).not.toHaveAttribute("aria-current");
  });

  test("settles the checked companies at once and drops only the ones with nothing left", async () => {
    const { bulk, load } = setup({ summaries: { 5: NOTHING_LEFT, 11: OPEN_EVENTS } });
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜다 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 2건 사건 확인" }));

    await waitFor(() => expect(bulk).toHaveBeenCalledWith([5, 11], []));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2건 처리했습니다"));
    expect(load).toHaveBeenCalledWith(5);
    expect(load).toHaveBeenCalledWith(11);
    expect(screen.queryByRole("button", { name: "㈜가 열기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "㈜다 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "㈜나 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 1건 사건 확인" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  test("refreshes the open panel with whatever the batch left behind", async () => {
    let calls = 0;
    const load: Load = async (companyId: number) => ({ ok: true as const, summary: companyId === 5 ? (calls++ === 0 ? OPEN_EVENTS : ONE_LEFT) : NOTHING_LEFT });
    setup({ load });
    fireEvent.click(screen.getByRole("button", { name: "㈜가 열기" }));
    expect(await screen.findByRole("checkbox", { name: "폐업" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "인원 감소" })).toBeInTheDocument());
    expect(screen.queryByRole("checkbox", { name: "폐업" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "㈜가 열기" })).toBeInTheDocument();
  });

  test("clears a stale load error once the batch has refreshed the panel", async () => {
    let calls = 0;
    const load: Load = async (companyId: number) =>
      companyId === 5
        ? calls++ === 0
          ? { ok: false as const, message: "불러오지 못했습니다" }
          : { ok: true as const, summary: ONE_LEFT }
        : { ok: true as const, summary: NOTHING_LEFT };
    setup({ load });
    fireEvent.click(screen.getByRole("button", { name: "㈜가 열기" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했습니다"));

    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "인원 감소" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a company whose evidence never loaded is not recorded as read", async () => {
    const load: Load = async (companyId: number) => (companyId === 5 ? { ok: false as const, message: "불러오지 못했습니다" } : { ok: true as const, summary: NOTHING_LEFT });
    const { bulk } = setup({ kind: "verification", load });
    fireEvent.click(screen.getByRole("button", { name: "㈜가 열기" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("불러오지 못했습니다"));

    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 검토 완료" }));

    await waitFor(() => expect(bulk).toHaveBeenCalledWith([5], []));
  });

  test("tells the action which companies had their evidence opened", async () => {
    const { bulk, load } = setup({ kind: "verification", summaries: { 5: NOTHING_LEFT, 11: NOTHING_LEFT } });
    fireEvent.click(screen.getByRole("button", { name: "㈜가 열기" }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(5));
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜다 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 2건 검토 완료" }));

    await waitFor(() => expect(bulk).toHaveBeenCalledWith([5, 11], [5]));
  });

  test("closing the dialog forgets what was settled and what was checked", async () => {
    setup({ summaries: { 5: NOTHING_LEFT } });
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "㈜가 열기" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: TEXT }));

    expect(screen.getByRole("button", { name: "㈜가 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "선택 0건 사건 확인" })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("locks the checkboxes while the batch runs", async () => {
    let settle!: (result: { ok: true; done: number }) => void;
    setup({ bulk: () => new Promise((resolve) => { settle = resolve; }) });
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "㈜가 선택" })).toBeDisabled());
    settle({ ok: true, done: 1 });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "㈜다 선택" })).toBeEnabled());
  });

  test("a refused batch is announced and keeps every row", async () => {
    setup({ bulk: async () => ({ ok: false as const, message: "3건 처리 후 실패했습니다" }) });
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("3건 처리 후 실패했습니다"));
    expect(screen.getByRole("button", { name: "㈜가 열기" })).toBeInTheDocument();
  });

  test("a thrown batch leaves the buttons usable", async () => {
    setup({ bulk: async () => { throw new Error("서버가 응답하지 않습니다"); } });
    fireEvent.click(screen.getByRole("checkbox", { name: "㈜가 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 사건 확인" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("서버가 응답하지 않습니다"));
    expect(screen.getByRole("button", { name: "선택 1건 사건 확인" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "모두 선택" })).toBeEnabled();
  });

  test("a row that cannot be settled in bulk has no checkbox and 모두 선택 skips it", () => {
    setup();
    expect(screen.queryByRole("checkbox", { name: "㈜나 선택" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 선택" }));
    expect(screen.getByRole("button", { name: "선택 2건 사건 확인" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 선택" }));
    expect(screen.getByRole("button", { name: "선택 0건 사건 확인" })).toBeDisabled();
  });

  test("the verification queue is finished by reviewing, not by confirming", () => {
    setup({ kind: "verification" });
    expect(screen.getByRole("button", { name: "선택 0건 검토 완료" })).toBeInTheDocument();
  });
});
