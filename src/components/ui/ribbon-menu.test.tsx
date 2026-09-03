import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { RibbonMenu } from "@/components/ui/ribbon-menu";

const CHOICES = [
  { href: "/companies/5?queue=review", label: "㈜가", note: "사업자번호 미확보 · 동명 충돌 1" },
  { href: "/companies/9?queue=review", label: "㈜나", note: "검토 필요" },
];

const THREE = [...CHOICES, { href: "/companies/12?queue=review", label: "㈜다", note: "기사 0건" }];

beforeEach(() => {
  push.mockClear();
});

describe("RibbonMenu", () => {
  test("opens on click and lists every choice with where it goes", () => {
    render(<RibbonMenu text="확인 필요 2개사" choices={CHOICES} />);
    const button = screen.getByRole("button", { name: "확인 필요 2개사" });

    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("href", "/companies/5?queue=review");
    expect(options[0]).toHaveTextContent("㈜가");
    expect(options[0]).toHaveTextContent("사업자번호 미확보 · 동명 충돌 1");
    expect(options[1]).toHaveAttribute("href", "/companies/9?queue=review");
  });

  test("closes on Escape", () => {
    render(<RibbonMenu text="확인 필요 2개사" choices={CHOICES} />);
    const button = screen.getByRole("button", { name: "확인 필요 2개사" });
    fireEvent.click(button);

    fireEvent.keyDown(button, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("closes when the click lands outside it", () => {
    render(
      <div>
        <RibbonMenu text="확인 필요 2개사" choices={CHOICES} />
        <button type="button">바깥</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "확인 필요 2개사" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "바깥" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("walks the list with the arrow keys and goes there on Enter", () => {
    render(<RibbonMenu text="확인 필요 2개사" choices={CHOICES} />);
    const button = screen.getByRole("button", { name: "확인 필요 2개사" });

    fireEvent.keyDown(button, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(screen.getByRole("listbox")).toHaveFocus();

    fireEvent.keyDown(button, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/companies/5?queue=review");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("goes to the option the keyboard focus is actually on", () => {
    render(<RibbonMenu text="확인 필요 3개사" choices={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "확인 필요 3개사" }));
    const options = screen.getAllByRole("option");

    options[2].focus();
    fireEvent.keyDown(options[2], { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/companies/12?queue=review");
  });

  test("keeps the options out of the tab order so the listbox stays the focus holder", () => {
    render(<RibbonMenu text="확인 필요 3개사" choices={THREE} />);
    fireEvent.click(screen.getByRole("button", { name: "확인 필요 3개사" }));

    for (const option of screen.getAllByRole("option")) expect(option).toHaveAttribute("tabindex", "-1");
  });

  test("starts the highlight at the top every time it opens", () => {
    render(<RibbonMenu text="확인 필요 3개사" choices={THREE} />);
    const button = screen.getByRole("button", { name: "확인 필요 3개사" });

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "Escape" });
    fireEvent.click(button);

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  test("arrow down moves the highlight to the next choice", () => {
    render(<RibbonMenu text="확인 필요 2개사" choices={CHOICES} />);
    const button = screen.getByRole("button", { name: "확인 필요 2개사" });

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(button, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/companies/9?queue=review");
  });
});
