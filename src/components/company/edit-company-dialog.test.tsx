import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { EditCompanyDialog, type EditableCompany } from "@/components/company/edit-company-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const COMPANY: EditableCompany = { id: 3, year: 2026, name: "㈜가", industry: "ICT", businessNo: "1208824298", aliases: ["가", "가나"], isActive: true };

function setup(overrides: Partial<EditableCompany> = {}) {
  const edit = vi.fn(async () => ({ ok: true as const }));
  const setActive = vi.fn(async () => ({ ok: true as const }));
  render(<EditCompanyDialog company={{ ...COMPANY, ...overrides }} actions={{ edit, setActive }} />);
  fireEvent.click(screen.getByRole("button", { name: "기업 편집" }));
  return { edit, setActive };
}

describe("EditCompanyDialog", () => {
  test("opens with the current values and submits the edited ones", async () => {
    const { edit } = setup();
    expect(screen.getByLabelText("기업명")).toHaveValue("㈜가");
    expect(screen.getByLabelText("사업자번호")).toHaveValue("120-88-24298");
    expect(screen.getByLabelText("검색 별칭")).toHaveValue("가, 가나");
    fireEvent.change(screen.getByLabelText("업종"), { target: { value: "제조" } });
    fireEvent.change(screen.getByLabelText("검색 별칭"), { target: { value: "가나\n가나다, 가" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith({ companyId: 3, name: "㈜가", industry: "제조", businessNo: "120-88-24298", aliases: ["가나", "가나다", "가"] }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다."));
    expect(refresh).toHaveBeenCalled();
  });

  test("shows the action's error and keeps the form open", async () => {
    const edit = vi.fn(async () => ({ ok: false as const, message: "이미 등록된 기업입니다." }));
    render(<EditCompanyDialog company={COMPANY} actions={{ edit, setActive: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "기업 편집" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이미 등록된 기업입니다."));
    expect(screen.getByLabelText("기업명")).toBeInTheDocument();
  });

  test("excluding takes two clicks, restoring one", async () => {
    const { setActive } = setup();
    fireEvent.click(screen.getByRole("button", { name: "분석 대상에서 제외" }));
    expect(setActive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "정말 제외" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 3, isActive: false }));
  });

  test("an excluded company offers 복귀", async () => {
    const { setActive } = setup({ isActive: false });
    fireEvent.click(screen.getByRole("button", { name: "분석 대상으로 복귀" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith({ companyId: 3, isActive: true }));
  });

  test("closing resets the armed exclude confirmation", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "분석 대상에서 제외" }));
    expect(screen.getByRole("button", { name: "정말 제외" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "기업 편집" }));
    expect(screen.getByRole("button", { name: "분석 대상에서 제외" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정말 제외" })).not.toBeInTheDocument();
  });
});
