import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { RegisterDialog } from "@/components/company/register-dialog";
import type { CompanyModel } from "@/generated/prisma/models";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("@/app/(app)/companies/actions", () => ({ setCompanyActiveAction: vi.fn() }));

function company(over: Partial<CompanyModel> = {}): CompanyModel {
  return {
    id: 1,
    name: "딥노이드",
    year: 2026,
    displayOrder: 0,
    isActive: true,
    businessNo: "1234567890",
    industry: "의료AI",
    officialName: "딥노이드",
    sector: null,
    ceoName: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    aliases: null,
    ...over,
  } as CompanyModel;
}

describe("RegisterDialog", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/companies");
  });

  test("closing the dialog after a notice strips it from the URL", () => {
    render(<RegisterDialog year={2026} companies={[]} action={vi.fn()} notice="3건 등록" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/companies", { scroll: false });
  });

  test("closing the dialog keeps other live URL params but drops notice", () => {
    window.history.replaceState(null, "", "/companies?year=2026&notice=3%EA%B1%B4&run=5,6&stage=full");
    render(<RegisterDialog year={2026} companies={[]} action={vi.fn()} notice="3건 등록" />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/companies?year=2026&run=5%2C6&stage=full", { scroll: false });
  });

  test("shows an exclude button for an active company on the manage tab", () => {
    render(<RegisterDialog year={2026} companies={[company({ isActive: true })]} action={vi.fn()} notice="3건 등록" />);
    fireEvent.click(screen.getByRole("tab", { name: "등록된 기업" }));
    expect(screen.getByRole("button", { name: "딥노이드 제외" })).toBeInTheDocument();
  });
});
