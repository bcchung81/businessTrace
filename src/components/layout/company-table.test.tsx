import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyTable } from "@/components/layout/company-table";
import type { CompanyModel } from "@/generated/prisma/models";

function company(patch: Partial<CompanyModel> = {}): CompanyModel {
  return {
    id: 1,
    name: "넷록스",
    year: 2024,
    displayOrder: 0,
    isActive: true,
    businessNo: null,
    industry: null,
    officialName: null,
    sector: null,
    ceoName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe("CompanyTable", () => {
  it("tells the admin nothing is registered yet instead of showing an empty grid", () => {
    render(<CompanyTable companies={[]} />);

    expect(screen.getByText("등록된 기업이 없습니다.")).toBeInTheDocument();
  });

  it("formats the business number the way DART and 국세청 display it", () => {
    render(<CompanyTable companies={[company({ businessNo: "1208824298" })]} />);

    expect(screen.getByText("120-88-24298")).toBeInTheDocument();
  });

  it("marks a company with no business number as unverified so DART lookup is visibly pending", () => {
    render(<CompanyTable companies={[company({ businessNo: null })]} />);

    expect(screen.getByText("미확인")).toBeInTheDocument();
  });

  it("shows whether the company is still an analysis target", () => {
    render(
      <CompanyTable
        companies={[company({ id: 1, name: "넷록스" }), company({ id: 2, name: "크립토랩", isActive: false })]}
      />,
    );

    expect(screen.getByText("분석 대상")).toBeInTheDocument();
    expect(screen.getByText("제외")).toBeInTheDocument();
  });

  it("lists every company it is given", () => {
    render(
      <CompanyTable
        companies={[company({ id: 1, name: "넷록스" }), company({ id: 2, name: "크립토랩" })]}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("links each company name to its evidence screen", () => {
    render(<CompanyTable companies={[company({ id: 42, name: "크립토랩" })]} />);

    expect(screen.getByRole("link", { name: "크립토랩" })).toHaveAttribute(
      "href",
      "/companies/42",
    );
  });
});
