import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CompanyChips } from "@/components/dashboard/company-chips";

describe("CompanyChips", () => {
  test("links each company with its event count", () => {
    render(<CompanyChips items={[{ id: 1, name: "알체라", count: 2 }]} empty="없음" />);

    expect(screen.getByRole("link", { name: /알체라/ })).toHaveAttribute("href", "/companies/1");
    expect(screen.getByRole("link", { name: /알체라/ })).toHaveTextContent("2");
  });

  test("says empty in words", () => {
    render(<CompanyChips items={[]} empty="주의 기업 없음" />);
    expect(screen.getByText("주의 기업 없음")).toBeInTheDocument();
  });
});
