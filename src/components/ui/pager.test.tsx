import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LIST_PAGE_SIZE, Pager, paginate } from "@/components/ui/pager";

describe("paginate", () => {
  it("slices twenty rows per page and clamps the page index", () => {
    const rows = Array.from({ length: 45 }, (_, index) => index);

    expect(LIST_PAGE_SIZE).toBe(20);
    expect(paginate(rows, 0)).toMatchObject({ pages: 3, current: 0 });
    expect(paginate(rows, 0).slice).toHaveLength(20);
    expect(paginate(rows, 2).slice).toHaveLength(5);
    expect(paginate(rows, 9)).toMatchObject({ current: 2 });
    expect(paginate([], 0)).toMatchObject({ pages: 1, current: 0, slice: [] });
  });
});

describe("Pager", () => {
  it("renders 이전/다음 with the page position and disables the edges", () => {
    const onPage = vi.fn();
    render(<Pager current={0} pages={3} onPage={onPage} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pager current={0} pages={1} onPage={() => {}} />);

    expect(container).toBeEmptyDOMElement();
  });
});
