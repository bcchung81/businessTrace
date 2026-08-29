import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyPipelineGrid, compactValue } from "@/components/dashboard/company-pipeline-grid";
import type { MatrixRow } from "@/lib/services/matrixRows";

const NOW = new Date("2026-08-29T00:00:00.000Z");

function row(id: number, over: Partial<MatrixRow> = {}): MatrixRow {
  return {
    id,
    name: `기업${id}`,
    businessNo: "1198701587",
    verdict: "verified",
    faithfulness: 0.9,
    citations: 5,
    latestArticle: "2026-08-26T00:00:00.000Z",
    cells: {
      nts: { state: "ok", value: "계속사업자", note: "부가가치세 일반과세자" },
      nps: { state: "ok", value: "가입자 61명", note: "625870" },
      narajangteo: { state: "unmeasurable", value: "조달업체 미등록", note: "공공조달 미참여" },
      venture: { state: "absent", value: "벤처확인 명단에 없음", note: "" },
      dart: { state: "conflict", value: "이름이 정확히 맞는 기업이 없다", note: "후보 2건" },
      dartFinance: { state: "absent", value: "재무제표 미공시 (비외감)", note: "" },
    },
    ...over,
  };
}

const ROWS = Array.from({ length: 24 }, (_, index) => row(index + 1));

describe("CompanyPipelineGrid", () => {
  test("prints the value each stage returned, not a tick", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);
    const line = screen.getByRole("row", { name: /기업1/ });

    expect(within(line).getByText("계속사업자")).toBeInTheDocument();
    expect(within(line).getByText("가입자 61명")).toBeInTheDocument();
  });

  test("leads with the verdict and ends with score, citations and newest article", () => {
    render(<CompanyPipelineGrid rows={[row(1, { verdict: "review", faithfulness: 0.72, citations: 3 })]} pageSize={10} now={NOW} />);
    const line = screen.getByRole("row", { name: /기업1/ });
    const cells = within(line).getAllByRole("cell");

    expect(within(line).getByText("검토")).toBeInTheDocument();
    expect(cells.at(-3)).toHaveTextContent("0.72");
    expect(cells.at(-2)).toHaveTextContent("3");
    expect(cells.at(-1)).toHaveTextContent("08-26");
  });

  test("warns instead of leaving the business number blank", () => {
    render(<CompanyPipelineGrid rows={[row(1, { businessNo: null })]} pageSize={10} now={NOW} />);

    expect(screen.getByText("미확보 · 대조 불가")).toHaveClass("text-review");
  });

  test("formats a present business number with dashes in tabular figures", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);

    expect(screen.getByText("119-87-01587")).toHaveClass("font-mono");
  });

  test("marks a newest article older than 30 days in risk colour", () => {
    render(<CompanyPipelineGrid rows={[row(1, { latestArticle: "2026-05-11T00:00:00.000Z" })]} pageSize={10} now={NOW} />);

    expect(screen.getByText("05-11")).toHaveClass("text-risk");
  });

  test("draws a left edge on risk and review rows only", () => {
    render(<CompanyPipelineGrid rows={[row(1, { verdict: "risk" }), row(2, { verdict: "verified" })]} pageSize={10} now={NOW} />);

    expect(screen.getByRole("row", { name: /기업1/ })).toHaveClass("shadow-[inset_3px_0_0_var(--risk-fill)]");
    expect(screen.getByRole("row", { name: /기업2/ })).not.toHaveClass("shadow-[inset_3px_0_0_var(--risk-fill)]");
  });

  test("sorts in triage order by default and re-sorts by name on request", () => {
    render(<CompanyPipelineGrid rows={[row(1, { name: "나", verdict: "verified" }), row(2, { name: "가", verdict: "risk" })]} pageSize={10} now={NOW} />);
    const names = () => screen.getAllByRole("rowheader").map((cell) => cell.textContent);

    expect(names()).toEqual(["가", "나"]);
    fireEvent.click(screen.getByRole("radio", { name: "기업명" }));
    expect(names()).toEqual(["가", "나"]);
    fireEvent.click(screen.getByRole("radio", { name: "검증 점수" }));
    expect(names()).toEqual(["나", "가"].sort((a, b) => a.localeCompare(b, "ko")));
  });

  test("keeps a blank short in the grid but explains it on hover", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);
    const cell = screen.getByLabelText(/기업1 재무 결측/);

    expect(cell).toHaveTextContent("미공시");
    expect(cell).toHaveAttribute("title", expect.stringContaining("재무제표 미공시 (비외감)"));
  });

  test("holds the block at a constant height so paging does not resize the table", () => {
    const { container } = render(<CompanyPipelineGrid rows={ROWS} pageSize={10} now={NOW} />);
    const height = () => container.querySelectorAll("tbody tr").length;

    expect(height()).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(height()).toBe(10);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  test("names the four blank kinds and the business-number warning in the footer", () => {
    render(<CompanyPipelineGrid rows={[row(1)]} pageSize={10} now={NOW} />);

    for (const label of ["확인", "결측", "충돌", "미조회"]) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(/사업자번호 미확보는 뉴스 외 근거를 붙일 수 없다/)).toBeInTheDocument();
  });

  test("says so when there are no companies", () => {
    render(<CompanyPipelineGrid rows={[]} now={NOW} />);

    expect(screen.getByText(/등록된 기업이 없습니다/)).toBeInTheDocument();
  });
});

describe("compactValue", () => {
  test("turns a conflict with candidates into the candidate count", () => {
    expect(compactValue("dart", { state: "conflict", value: "x", note: "후보 3건" })).toBe("후보 3건");
  });

  test("shortens absent per stage", () => {
    expect(compactValue("dartFinance", { state: "absent", value: "x", note: "" })).toBe("미공시");
    expect(compactValue("nps", { state: "absent", value: "x", note: "" })).toBe("미가입");
  });

  test("prints a dash for pending", () => {
    expect(compactValue("nts", { state: "pending", value: "", note: "" })).toBe("—");
  });
});
