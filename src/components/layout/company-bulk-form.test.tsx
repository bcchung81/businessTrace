import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyBulkForm } from "@/components/layout/company-bulk-form";

describe("CompanyBulkForm", () => {
  it("accepts names one per line, each with an optional business number", () => {
    render(<CompanyBulkForm year={2024} />);

    const names = screen.getByLabelText("기업명 (한 줄에 하나 · 사업자번호는 뒤에)");
    expect(names.tagName).toBe("TEXTAREA");
    expect(names).toBeRequired();
    expect(names).toHaveAttribute("placeholder", expect.stringContaining("120-88-24298"));
    expect(screen.getByText(/사업자번호를 함께 적으면 등록 즉시 원천 대조가 열립니다/)).toBeInTheDocument();
  });

  it("defaults the evaluation year so the admin does not retype it", () => {
    render(<CompanyBulkForm year={2026} />);

    expect(screen.getByLabelText("평가연도")).toHaveValue(2026);
  });

  it("reports back what was registered and what was skipped", () => {
    render(<CompanyBulkForm year={2024} notice="3건 등록, 1건 중복 제외 (넷록스)" />);

    expect(screen.getByRole("status")).toHaveTextContent("3건 등록, 1건 중복 제외 (넷록스)");
  });

  it("shows no report before anything is submitted", () => {
    render(<CompanyBulkForm year={2024} />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers to run the freshly registered companies right away", () => {
    render(<CompanyBulkForm year={2026} notice="2건 등록" runHref="/companies?year=2026&run=5,6" />);

    expect(screen.getByRole("link", { name: "지금 분석 실행" })).toHaveAttribute("href", "/companies?year=2026&run=5,6");
  });
});
