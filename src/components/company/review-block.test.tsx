import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ReviewBlock, type ReviewActions } from "@/components/company/review-block";
import type { ReviewSummary } from "@/lib/repositories/reviewItems";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

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

const summary = (items: ReviewSummary["items"], lastDecidedAt: string | null = null): ReviewSummary => ({ items, lastDecidedAt });

describe("ReviewBlock", () => {
  test("with nothing to settle it is one line that still says zero", () => {
    render(<ReviewBlock companyId={1} year={2026} summary={summary([], "2026-08-30T05:20:00.000Z")} actions={mockActions()} />);
    expect(screen.getByRole("heading", { name: "확인 필요" })).toBeInTheDocument();
    expect(screen.getByText("없음")).toBeInTheDocument();
    expect(screen.getByText(/동명 충돌 0 · 검토 필요 0 · 미확인 경보·주의 0/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("nps conflict preselects the registry-matching candidate and confirms it", async () => {
    const actions = mockActions();
    render(
      <ReviewBlock
        companyId={1}
        year={2026}
        summary={summary([{ kind: "nps_conflict", chosen: null, candidates: [{ prefix: "625870", name: "㈜가", address: "서울", registryMatch: true }, { prefix: "111111", name: "가", address: null, registryMatch: false }] }])}
        actions={actions}
      />,
    );
    expect(screen.getByText("1건")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "㈜가" })).toBeChecked();
    expect(screen.getByText("등록 번호 일치")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 사업장으로 확정" }));
    await waitFor(() => expect(actions.decideNps).toHaveBeenCalledWith({ companyId: 1, prefix: "625870", label: "㈜가 · 서울" }));
  });

  test("dart candidate can be rejected as not registered", async () => {
    const actions = mockActions();
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "dart_conflict", candidateCount: 1, candidate: { corpCode: "00123", corpName: "주식회사 가", stockCode: null } }])} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "아니다 — DART 미등록으로 확정" }));
    await waitFor(() => expect(actions.decideDart).toHaveBeenCalledWith({ companyId: 1, corpCode: "none" }));
    fireEvent.click(screen.getByRole("button", { name: "이 기업이 맞다" }));
    await waitFor(() => expect(actions.decideDart).toHaveBeenCalledWith({ companyId: 1, corpCode: "00123", label: "주식회사 가" }));
  });

  test("fsc number mismatch can be accepted or rejected as a namesake", async () => {
    const actions = mockActions();
    render(
      <ReviewBlock
        companyId={1}
        year={2026}
        summary={summary([{ kind: "fsc_conflict", registryNo: "6258700001", fscNo: "2068117321", corpName: "주식회사 가온" }])}
        actions={actions}
      />,
    );
    expect(screen.getByText(/확보 6258700001/)).toBeInTheDocument();
    expect(screen.getByText(/금융위 2068117321/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "동명 타사다 — 금융위 미등재로 확정" }));
    await waitFor(() => expect(actions.decideFsc).toHaveBeenCalledWith({ companyId: 1, value: "none" }));
    fireEvent.click(screen.getByRole("button", { name: "이 기업이 맞다" }));
    await waitFor(() => expect(actions.decideFsc).toHaveBeenCalledWith({ companyId: 1, value: "2068117321", label: "주식회사 가온" }));
  });

  test("verification review shows the failed gate with thresholds and records a note", async () => {
    const actions = mockActions();
    render(
      <ReviewBlock
        companyId={1}
        year={2026}
        summary={summary([{ kind: "verification", runId: 9, status: "needs_review", failed: ["근거 충실도"], faithfulness: 0.8, sourceCoverage: 1, evidenceMatch: 0.62, counterEvidence: ["보도자료 의존"], note: null }])}
        actions={actions}
      />,
    );
    expect(screen.getByText(/탈락 사유: 근거 충실도/)).toBeInTheDocument();
    expect(screen.getByText(/0\.80 · ≥0\.85/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("검토 메모"), { target: { value: "원문에 없음" } });
    fireEvent.click(screen.getByRole("button", { name: "검토 완료로 기록" }));
    await waitFor(() => expect(actions.reviewVerification).toHaveBeenCalledWith({ runId: 9, note: "원문에 없음" }));
  });

  test("open events confirm the checked ones or all of them", async () => {
    const actions = mockActions();
    const events = [
      { id: 11, occurredAt: "2026-08-27T00:00:00.000Z", severity: "alert" as const, kind: "closure", title: "폐업", evidence: [{ label: "국세청", link: "https://x" }] },
      { id: 12, occurredAt: "2026-08-22T00:00:00.000Z", severity: "notice" as const, kind: "headcount_down", title: "인원 감소", evidence: [] },
    ];
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "open_events", events }])} actions={actions} />);
    expect(screen.getByRole("button", { name: "선택 0건 확인" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "폐업" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1건 확인" }));
    await waitFor(() => expect(actions.confirmEvents).toHaveBeenCalledWith({ companyId: 1, eventIds: [11], action: "acknowledge" }));
    fireEvent.click(screen.getByRole("button", { name: "모두 확인" }));
    await waitFor(() => expect(actions.confirmEvents).toHaveBeenCalledWith({ companyId: 1, eventIds: [11, 12], action: "acknowledge" }));
  });

  test("disables the block while an action runs and confirms afterwards", async () => {
    const actions = mockActions();
    let resolve!: (value: { ok: true }) => void;
    actions.confirmEvents = vi.fn(() => new Promise<{ ok: true }>((r) => { resolve = r; }));
    const events = [
      { id: 11, occurredAt: "2026-08-27T00:00:00.000Z", severity: "alert" as const, kind: "closure", title: "폐업", evidence: [] },
    ];
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "open_events", events }])} actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "모두 확인" })).toBeDisabled());
    resolve({ ok: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다"));
  });

  test("no-news collects aliases and saves them", async () => {
    const actions = mockActions();
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "no_news", aliases: ["가테크"] }])} actions={actions} />);
    const input = screen.getByLabelText("검색 별칭");
    fireEvent.change(input, { target: { value: "Ga Tech" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Ga Tech")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장 후 수집만 재실행" }));
    await waitFor(() => expect(actions.saveAliases).toHaveBeenCalledWith({ companyId: 1, aliases: ["가테크", "Ga Tech"] }));
  });

  test("missing business number pre-fills the NPS prefix, previews what opens and saves", async () => {
    const actions = mockActions();
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "no_business_no", npsPrefix: "625870" }])} actions={actions} />);
    const input = screen.getByLabelText("사업자번호");
    expect(input).toHaveValue("625870");
    expect(screen.getByText(/10자리를 입력하면/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "625-87-00001" } });
    expect(screen.getByText(/국세청·나라장터·금융위 조회 가능/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장 후 원천 대조" }));
    await waitFor(() => expect(actions.saveBusinessNo).toHaveBeenCalledWith({ companyId: 1, businessNo: "625-87-00001" }));
  });

  test("an action failure is announced", async () => {
    const actions = mockActions();
    actions.saveBusinessNo = vi.fn(async () => ({ ok: false as const, message: "사업자번호는 숫자 10자리여야 합니다." }));
    render(<ReviewBlock companyId={1} year={2026} summary={summary([{ kind: "no_business_no", npsPrefix: null }])} actions={actions} />);
    fireEvent.change(screen.getByLabelText("사업자번호"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "저장 후 원천 대조" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("10자리"));
    expect(within(screen.getByRole("alert")).getByText(/10자리/)).toBeInTheDocument();
  });  test("says how many DART namesakes there are instead of always claiming one", () => {
    const actions = mockActions();
    render(
      <ReviewBlock
        companyId={1}
        year={2026}
        summary={summary([{ kind: "dart_conflict", candidateCount: 3, candidate: { corpCode: "001", corpName: "주식회사 가", stockCode: null } }])}
        actions={actions}
      />,
    );

    expect(screen.getByText(/후보 3건/)).toBeInTheDocument();
    expect(screen.queryByText(/후보 1건/)).not.toBeInTheDocument();
  });
});
