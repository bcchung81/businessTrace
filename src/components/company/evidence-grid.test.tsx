import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { EvidenceGrid } from "@/components/company/evidence-grid";
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
