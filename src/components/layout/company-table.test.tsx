import { describe, it, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanyTable } from "@/components/layout/company-table";
import type { CompanyModel } from "@/generated/prisma/models";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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
  aliases: null,
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

  it("pages twenty companies at a time", () => {
    const many = Array.from({ length: 25 }, (_, index) => company({ id: index + 1, name: `기업${index + 1}` }));
    render(<CompanyTable companies={many} />);

    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("links each company name to its evidence screen", () => {
    render(<CompanyTable companies={[company({ id: 42, name: "크립토랩" })]} />);

    expect(screen.getByRole("link", { name: "크립토랩" })).toHaveAttribute(
      "href",
      "/companies/42",
    );
  });

  test("offers 제외 for active rows and 복귀 for excluded ones", async () => {
    const setActive = vi.fn(async () => ({ ok: true as const }));
    render(<CompanyTable companies={[company({ id: 1, name: "㈜가", isActive: true }), company({ id: 2, name: "㈜나", isActive: false })]} onSetActive={setActive} />);
    fireEvent.click(screen.getByRole("button", { name: "㈜가 제외" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 1, isActive: false }));
    fireEvent.click(screen.getByRole("button", { name: "㈜나 복귀" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 2, isActive: true }));
  });

  test("shows the action's error and does not refresh", async () => {
    refresh.mockClear();
    const setActive = vi.fn(async () => ({ ok: false as const, message: "기업을 찾을 수 없습니다." }));
    render(<CompanyTable companies={[company({ id: 1, name: "㈜가" })]} onSetActive={setActive} />);
    fireEvent.click(screen.getByRole("button", { name: "㈜가 제외" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("기업을 찾을 수 없습니다."));
    expect(refresh).not.toHaveBeenCalled();
  });
});
