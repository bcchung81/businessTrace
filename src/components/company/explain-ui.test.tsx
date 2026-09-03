import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ContributionBars } from "@/components/company/contribution-bars";
import { OpinionCitations } from "@/components/company/opinion-citations";
import { VerificationPanel, type VerificationLayers } from "@/components/company/verification-panel";

describe("ContributionBars", () => {
  const contributions = [
    { key: "sentiment" as const, label: "감성", normalised: 1, weight: 0.3, share: 0.6 },
    { key: "award" as const, label: "수상", normalised: 0.5, weight: 0.2, share: 0.4 },
    { key: "investment" as const, label: "투자", normalised: null, weight: 0.2, share: null },
    { key: "finance" as const, label: "재무", normalised: null, weight: 0.2, share: null },
    { key: "verification" as const, label: "검증", normalised: null, weight: 0.1, share: null },
  ];

  test("draws one bar per metric with the percentage beside it and hatch for missing", () => {
    render(<ContributionBars contributions={contributions} total={0.8} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText("60%")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("img", { name: "감성 기여도 60%" })).toHaveStyle({ width: "60%" });
    expect(within(rows[2]).getByText("—")).toBeInTheDocument();
    expect(within(rows[2]).getByText("—")).toHaveClass("hatch");
  });

  test("shows the total next to the weights sum note", () => {
    render(<ContributionBars contributions={contributions} total={0.8} />);
    expect(screen.getByText(/총점/)).toHaveTextContent("0.800");
    expect(screen.getByText(/합계 100%/)).toBeInTheDocument();
  });

  test("says why there are no bars when nothing was scored", () => {
    render(<ContributionBars contributions={contributions.map((c) => ({ ...c, share: null, normalised: null }))} total={null} />);
    expect(screen.getByText("미분석 — 기여도를 낼 수 없다")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("OpinionCitations", () => {
  const sentences = [
    { sentence: "시리즈B 120억 원을 유치했다.", snippets: [{ title: "㈜가 120억 유치", link: "https://n.example/1", paragraph: "㈜가는 시리즈B 투자로 120억 원을 유치했다고 밝혔다.", score: 0.7 }] },
    { sentence: "근거 없는 문장이다.", snippets: [] },
  ];

  test("marks cited sentences and opens the paragraph on hover", () => {
    render(<OpinionCitations sentences={sentences} />);
    const cited = screen.getByText("시리즈B 120억 원을 유치했다.");
    expect(cited).toHaveAttribute("data-cited", "true");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(cited);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByRole("link", { name: "㈜가 120억 유치" })).toHaveAttribute("href", "https://n.example/1");
    expect(within(tip).getByText(/일치 0\.70/)).toBeInTheDocument();
    expect(within(tip).getByText(/120억 원을 유치/)).toBeInTheDocument();
    fireEvent.mouseLeave(cited);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("labels an uncited sentence instead of colouring it", () => {
    render(<OpinionCitations sentences={sentences} />);
    const bare = screen.getByText("근거 없는 문장이다.");
    expect(bare).toHaveAttribute("data-cited", "false");
    fireEvent.mouseEnter(bare);
    expect(screen.getByRole("tooltip")).toHaveTextContent("일치 기사 없음");
  });

  test("opens on focus too, so keyboards get the same evidence", () => {
    render(<OpinionCitations sentences={sentences} />);
    fireEvent.focus(screen.getByText("시리즈B 120억 원을 유치했다."));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("VerificationPanel", () => {
  const layers: VerificationLayers = {
    status: "needs_review",
    faithfulness: 0.8,
    sourceCoverage: 1,
    evidenceMatch: 0.62,
    counterEvidence: ["보도자료 의존"],
    invalid: [],
    cited: 4,
    total: 4,
    claims: [
      { claim: "120억 유치", supported: true, evidence: "기사 1" },
      { claim: "흑자 전환", supported: false, evidence: "" },
    ],
    reviewedAt: null,
    reviewNote: null,
  };

  test("is a badge until clicked, then a side panel with the four layers and thresholds", () => {
    render(<VerificationPanel layers={layers} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
    const panel = screen.getByRole("dialog", { name: "검증 근거" });
    expect(within(panel).getByText("출처 인용")).toBeInTheDocument();
    expect(within(panel).getByText(/1\.00 · ≥0\.5/)).toBeInTheDocument();
    expect(within(panel).getByText("근거 충실도")).toBeInTheDocument();
    expect(within(panel).getByText(/0\.80 · ≥0\.85/)).toBeInTheDocument();
    expect(within(panel).getByText("근거 일치")).toBeInTheDocument();
    expect(within(panel).getByText(/0\.62 · ≥0\.5/)).toBeInTheDocument();
    expect(within(panel).getByText("반증")).toBeInTheDocument();
    expect(within(panel).getByText("보도자료 의존")).toBeInTheDocument();
    expect(within(panel).getByText(/흑자 전환/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("carries the review record beside the badge — a bulk tick must not be invisible", () => {
    render(<VerificationPanel layers={{ ...layers, reviewedAt: "2026-09-02T04:00:00.000Z", reviewNote: "일괄 검토 완료 · 근거 미열람" }} />);
    expect(screen.getByText("검토 2026-09-02 · 일괄 검토 완료 · 근거 미열람")).toBeInTheDocument();
  });

  test("drops the note but keeps the date when the reviewer left none", () => {
    render(<VerificationPanel layers={{ ...layers, reviewedAt: "2026-09-02T04:00:00.000Z", reviewNote: null }} />);
    expect(screen.getByText("검토 2026-09-02")).toBeInTheDocument();
  });

  test("says nothing about a review that never happened", () => {
    render(<VerificationPanel layers={layers} />);
    expect(screen.queryByText(/^검토 2026/)).not.toBeInTheDocument();
  });

  test("offers to undo a review record — a bulk tick must be reversible somewhere", async () => {
    const undo = vi.fn(async () => ({ ok: true as const }));
    render(<VerificationPanel layers={{ ...layers, reviewedAt: "2026-09-02T04:00:00.000Z", reviewNote: "일괄 검토 완료 · 근거 미열람" }} runId={9} undo={undo} />);

    fireEvent.click(screen.getByRole("button", { name: "검토 기록 취소" }));

    await waitFor(() => expect(undo).toHaveBeenCalledWith({ runId: 9 }));
  });

  test("offers no undo when there is no review record to undo", () => {
    render(<VerificationPanel layers={layers} runId={9} undo={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "검토 기록 취소" })).not.toBeInTheDocument();
  });

  test("says why the undo failed instead of pretending it worked", async () => {
    const undo = vi.fn(async () => ({ ok: false as const, message: "unauthorized" }));
    render(<VerificationPanel layers={{ ...layers, reviewedAt: "2026-09-02T04:00:00.000Z", reviewNote: null }} runId={9} undo={undo} />);

    fireEvent.click(screen.getByRole("button", { name: "검토 기록 취소" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("unauthorized");
  });

  test("names the failed gate so the reader knows why it is 검토 필요", () => {
    render(<VerificationPanel layers={layers} />);
    fireEvent.click(screen.getByRole("button", { name: "검증 근거 열기" }));
    expect(screen.getByText(/탈락 사유: 근거 충실도/)).toBeInTheDocument();
  });

  test("shows 미분석 and no button without a verification", () => {
    render(<VerificationPanel layers={null} />);
    expect(screen.getByText("미분석")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("opens as a dialog, focuses 닫기, closes on Escape and on the overlay", () => {
    render(<VerificationPanel layers={layers} />);
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
});
