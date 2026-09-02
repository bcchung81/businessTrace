import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { CompanySearch } from "@/components/dashboard/company-search";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const companies = [
  { id: 1, name: "크립토랩", businessNo: "1" },
  { id: 3, name: "옥타코", businessNo: null },
  { id: 5, name: "넷록스", businessNo: "5" },
];

function renderSearch() {
  return render(<CompanySearch year={2026} companies={companies} />);
}

describe("CompanySearch", () => {
  test("filters the list to matches and flags a missing business number", () => {
    renderSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "옥타" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("옥타코");
    expect(options[0]).toHaveTextContent("미확보");
  });

  test("arrow down then enter navigates to the highlighted company", () => {
    renderSearch();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "옥타" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/companies/3");
  });

  test("clicking an item navigates to that company", () => {
    renderSearch();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "옥타" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /옥타코/ }));

    expect(push).toHaveBeenCalledWith("/companies/3");
  });

  test("enter with no highlight goes to the filtered company list", () => {
    renderSearch();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "넷" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/companies?year=2026&q=%EB%84%B7");
  });

  test("escape closes the list and clears the input", () => {
    renderSearch();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "옥타" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  test("aria-activedescendant tracks the highlighted option after arrow down", () => {
    renderSearch();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "옥타" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const option = screen.getByRole("option", { name: /옥타코/ });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
  });

  test("empty input or no matches keeps the list closed", () => {
    renderSearch();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "존재안함" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
