import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyPipelineGrid, compactValue } from "@/components/dashboard/company-pipeline-grid";
import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";

function row(id: number, over: Partial<CompanyPipelineRow> = {}): CompanyPipelineRow {
  return {
    id,
    name: `기업${id}`,
    cells: {
      news: { state: "ok", value: "15건", note: "" },
      nts: { state: "ok", value: "계속사업자", note: "부가가치세 일반과세자" },
      nps: { state: "ok", value: "가입자 61명", note: "625870" },
      narajangteo: { state: "unmeasurable", value: "조달업체 미등록", note: "공공조달 미참여" },
      venture: { state: "absent", value: "벤처확인 명단에 없음", note: "" },
      dart: { state: "conflict", value: "이름이 정확히 맞는 기업이 없다", note: "후보 2건" },
      dartFinance: { state: "absent", value: "재무제표 미공시 (비외감)", note: "" },
      fsc: { state: "pending", value: "", note: "" },
      llm: { state: "pending", value: "", note: "" },
      verify: { state: "pending", value: "", note: "" },
    },
    ...over,
  };
}

const ROWS = Array.from({ length: 24 }, (_, index) => row(index + 1));

describe("CompanyPipelineGrid", () => {
  test("prints the value each stage returned, not a tick", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);
    const line = screen.getByRole("row", { name: /기업1/ });

    expect(within(line).getByText("계속사업자")).toBeInTheDocument();
    expect(within(line).getByText("가입자 61명")).toBeInTheDocument();
    expect(within(line).getByText("15건")).toBeInTheDocument();
  });

  test("keeps the supporting detail beside the value", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);

    expect(screen.getByText("부가가치세 일반과세자")).toBeInTheDocument();
    expect(screen.getByText("625870")).toBeInTheDocument();
  });

  test("keeps a blank short in the grid but explains it on hover", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);
    const cell = screen.getByLabelText(/기업1 재무 결측/);

    expect(cell).toHaveTextContent("미공시");
    expect(cell).toHaveAttribute("title", expect.stringContaining("재무제표 미공시 (비외감)"));
  });

  test("holds the block at a constant height so paging does not resize the table", () => {
    const { container } = render(<CompanyPipelineGrid rows={ROWS} pageSize={10} />);
    const height = () => container.querySelectorAll("tbody tr").length;

    expect(height()).toBe(10);

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getAllByRole("row")).toHaveLength(5);
    expect(height()).toBe(10);
  });

  test("hides the padding rows from a screen reader", () => {
    const { container } = render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);

    expect(container.querySelectorAll("tbody tr[aria-hidden]")).toHaveLength(9);
  });

  test("names each cell state in words, never by colour alone", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);
    const line = screen.getByRole("row", { name: /기업1/ });

    expect(within(line).getByLabelText(/기업1 국세청 확인/)).toBeInTheDocument();
    expect(within(line).getByLabelText(/기업1 조달 측정 불가/)).toBeInTheDocument();
    expect(within(line).getByLabelText(/기업1 DART 충돌/)).toBeInTheDocument();
    expect(within(line).getByLabelText(/기업1 분석 미조회/)).toBeInTheDocument();
  });

  test("hatches a missing source so the blank cannot read as an empty value", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} />);

    expect(screen.getByLabelText(/기업1 재무 결측/).className).toContain("hatch");
  });

  test("shows one page of companies at a time, not all fifty", () => {
    render(<CompanyPipelineGrid rows={ROWS} pageSize={10} />);

    expect(screen.getAllByRole("row")).toHaveLength(11);
    expect(screen.queryByText("기업11")).not.toBeInTheDocument();
  });

  test("moves to the next page and back", () => {
    render(<CompanyPipelineGrid rows={ROWS} pageSize={10} />);

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("기업11")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByText("기업1")).toBeInTheDocument();
  });

  test("says where in the list the reader is", () => {
    render(<CompanyPipelineGrid rows={ROWS} pageSize={10} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText(/24개사/)).toBeInTheDocument();
  });

  test("locks the arrows at the ends so a page can never go out of range", () => {
    render(<CompanyPipelineGrid rows={ROWS} pageSize={10} />);

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });

  test("says nothing is registered rather than drawing an empty grid", () => {
    render(<CompanyPipelineGrid rows={[]} pageSize={10} />);

    expect(screen.getByText(/등록된 기업이 없습니다/)).toBeInTheDocument();
  });
});

describe("compactValue", () => {
  test("names a missing source by what is missing, not in a sentence", () => {
    expect(compactValue("dart", { state: "absent", value: "DART 에 등록되지 않은 기업", note: "" })).toBe("미등록");
    expect(compactValue("dartFinance", { state: "absent", value: "재무제표 미공시 (비외감)", note: "" })).toBe("미공시");
    expect(compactValue("fsc", { state: "absent", value: "금융위 명단에 없음", note: "" })).toBe("명단 없음");
  });

  test("shortens an unmeasurable source to the fact that nothing happened", () => {
    expect(
      compactValue("narajangteo", { state: "unmeasurable", value: "조달업체 미등록 — 공공조달 미참여", note: "" }),
    ).toBe("미참여");
  });

  test("keeps the candidate count on a conflict, because that is the actionable part", () => {
    expect(
      compactValue("dart", { state: "conflict", value: "이름이 정확히 맞는 기업이 없다", note: "후보 2건" }),
    ).toBe("후보 2건");
  });

  test("falls back to a bare word when a conflict carries no count", () => {
    expect(compactValue("nps", { state: "conflict", value: "상호가 겹친다", note: "" })).toBe("충돌");
  });

  test("leaves a confirmed value as it is", () => {
    expect(compactValue("nts", { state: "ok", value: "계속사업자", note: "부가가치세" })).toBe("계속사업자");
  });

  test("writes a dash for a stage nobody ran", () => {
    expect(compactValue("llm", { state: "pending", value: "", note: "" })).toBe("—");
  });
});
