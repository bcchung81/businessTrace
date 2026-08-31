import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EvidenceGrid, EvidenceStrip } from "@/components/company/evidence-grid";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";

const AT = new Date("2026-08-28T04:00:00Z");

function snapshot(over: Partial<StoredSnapshot> = {}): StoredSnapshot {
  return {
    source: "nts",
    status: "found",
    summary: "계속사업자 · 부가가치세 일반과세자",
    payload: {},
    fetchedAt: AT,
    ...over,
  };
}

describe("EvidenceGrid", () => {
  test("names each source in Korean rather than by its key", () => {
    render(<EvidenceGrid snapshots={[snapshot()]} />);

    expect(screen.getByText("국세청 휴폐업")).toBeInTheDocument();
    expect(screen.getByText("계속사업자 · 부가가치세 일반과세자")).toBeInTheDocument();
  });

  test("spells out the four kinds of blank so none reads as the others", () => {
    render(
      <EvidenceGrid
        snapshots={[
          snapshot({ source: "dart", status: "absent", summary: "DART 에 등록되지 않은 기업" }),
          snapshot({ source: "narajangteo", status: "unmeasurable", summary: "조달업체 미등록" }),
          snapshot({ source: "nps", status: "conflict", summary: "후보 8건" }),
          snapshot({ source: "fsc", status: "pending", summary: "조회하지 않았다" }),
        ]}
      />,
    );

    const cards = within(screen.getByRole("list", { name: "원천 대조" }));
    expect(cards.getByText("결측")).toBeInTheDocument();
    expect(cards.getByText("측정 불가")).toBeInTheDocument();
    expect(cards.getByText("충돌")).toBeInTheDocument();
    expect(cards.getByText("미조회")).toBeInTheDocument();
  });

  test("shows when the value was fetched, because a stale snapshot is not a fact", () => {
    render(<EvidenceGrid snapshots={[snapshot()]} />);

    const card = within(screen.getByRole("list", { name: "원천 대조" })).getByRole("listitem");
    expect(within(card).getByText(/2026-08-28/)).toBeInTheDocument();
  });

  test("tells the operator to run a lookup when nothing has been fetched yet", () => {
    render(<EvidenceGrid snapshots={[]} />);

    expect(screen.getByText(/원천 조회를 아직 실행하지 않았습니다/)).toBeInTheDocument();
  });

  test("hatches a missing source so it never reads as an empty value", () => {
    render(<EvidenceGrid snapshots={[snapshot({ source: "dart", status: "absent" })]} />);

    const card = within(screen.getByRole("list", { name: "원천 대조" })).getByRole("listitem");
    expect(card.className).toContain("hatch");
  });

  test("outlines an unmeasurable source instead of filling it, because nothing is missing there", () => {
    render(<EvidenceGrid snapshots={[snapshot({ source: "narajangteo", status: "unmeasurable" })]} />);
    const card = within(screen.getByRole("list", { name: "원천 대조" })).getByRole("listitem");

    expect(card.className).toContain("border-dashed");
    expect(card.className).not.toContain("hatch");
  });

  test("shows the legend so the four kinds of blank can be told apart", () => {
    render(<EvidenceGrid snapshots={[snapshot()]} />);

    expect(screen.getByText("측정 불가")).toBeInTheDocument();
    expect(screen.getByText(/원천에 이 기업이 없다/)).toBeInTheDocument();
  });
});

describe("EvidenceStrip", () => {
  const SNAPSHOTS = [
    snapshot({ source: "dart", status: "found", summary: "(주)엘리스그룹" }),
    snapshot({ source: "dartFinance", status: "absent", summary: "재무제표 미공시 — 정기·감사보고서 없음" }),
    snapshot({ source: "fsc", status: "pending", summary: "조회하지 않았다" }),
    snapshot({ source: "nts", status: "found", summary: "계속사업자" }),
    snapshot({ source: "narajangteo", status: "unmeasurable", summary: "조달 실적 없음" }),
    snapshot({ source: "venture", status: "found", summary: "벤처투자유형" }),
    snapshot({ source: "nps", status: "conflict", summary: "후보 8건" }),
  ];

  test("summarises the seven sources on one row with name, status and texture, keeping the full summary as a title", () => {
    render(<EvidenceStrip snapshots={SNAPSHOTS} />);
    const list = screen.getByRole("list", { name: "원천 대조 요약" });
    expect(list).toHaveClass("grid-cols-7");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent("DART");
    expect(items[0]).toHaveTextContent("확인");
    expect(items[1]).toHaveClass("hatch");
    expect(items[1]).toHaveTextContent("결측");
    expect(items[1]).toHaveAttribute("title", expect.stringContaining("재무제표"));
  });
});
