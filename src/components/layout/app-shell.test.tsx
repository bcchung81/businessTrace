import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";

const pathname = vi.fn(() => "/companies/28");
const search = vi.fn(() => new URLSearchParams("year=2025"));
vi.mock("next/navigation", () => ({ usePathname: () => pathname(), useSearchParams: () => search() }));

describe("AppShell", () => {
  test("shows the product name in the header", () => {
    render(<AppShell>본문</AppShell>);

    expect(
      within(screen.getByRole("banner")).getByText("기업성과추적", { selector: ".sr-only" }),
    ).toBeInTheDocument();
  });

  test("keeps the header to the wordmark — the menu lives in the side tabs", () => {
    render(<AppShell>본문</AppShell>);

    expect(within(screen.getByRole("banner")).queryByRole("navigation")).not.toBeInTheDocument();
  });

  test("floats the bookmark rail so it stays visible while the page scrolls", () => {
    render(<AppShell>본문</AppShell>);
    const aside = screen.getByRole("complementary");

    expect(aside.className).toContain("lg:fixed");
    expect(aside.className).toContain("lg:top-[72px]");
    expect(aside.className).toContain("lg:right-[max(");
    expect(aside.className).not.toContain("translate-x");
  });

  test("shows the three places this tool has as bookmark tabs on the left", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: /동향/ })).toHaveAttribute("href", "/dashboard?year=2025");
    expect(within(nav).getByRole("link", { name: /기업/ })).toHaveAttribute("href", "/companies?year=2025");
    expect(within(nav).getByRole("link", { name: /랭킹/ })).toHaveAttribute("href", "/ranking?year=2025");
    expect(within(nav).getByRole("link", { name: /이력/ })).toHaveAttribute("href", "/history?year=2025");
    expect(within(nav).getByRole("link", { name: /리포트/ })).toHaveAttribute("href", "/reports?year=2025");
    expect(within(nav).getByRole("link", { name: /동향/ })).toHaveClass("lg:[writing-mode:vertical-rl]");
  });

  test("carries the year in the URL into every tab", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(nav).getByRole("link", { name: /동향/ })).toHaveAttribute("href", "/dashboard?year=2025");
    expect(within(nav).getByRole("link", { name: /리포트/ })).toHaveAttribute("href", "/reports?year=2025");
  });

  test("links plainly when the URL has no year", () => {
    search.mockReturnValueOnce(new URLSearchParams());
    render(<AppShell>본문</AppShell>);
    expect(within(screen.getByRole("navigation", { name: "주요 메뉴" })).getByRole("link", { name: /동향/ })).toHaveAttribute("href", "/dashboard");
  });

  test("numbers the tabs like a dossier index and hangs them in the margin outside the content column", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getByRole("link", { name: /동향/ })).toHaveTextContent("01");
    expect(within(nav).getByRole("link", { name: /랭킹/ })).toHaveTextContent("03");
    expect(within(nav).getByRole("link", { name: /이력/ })).toHaveTextContent("04");
    expect(within(nav).getByRole("link", { name: /리포트/ })).toHaveTextContent("05");
    const rail = nav.closest("aside");
    expect(rail).toHaveClass("lg:fixed");
    expect(rail?.className).toContain("lg:right-[max(");
    expect(screen.getByRole("main")).toHaveClass("lg:border-l");
  });

  test("marks the tab of the current section, including nested pages", () => {
    render(<AppShell>본문</AppShell>);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });

    expect(within(nav).getByRole("link", { name: /기업/ })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /동향/ })).not.toHaveAttribute("aria-current");
  });

  test("renders its children inside the main region", () => {
    render(
      <AppShell>
        <p>분석 결과 없음</p>
      </AppShell>,
    );

    expect(within(screen.getByRole("main")).getByText("분석 결과 없음")).toBeInTheDocument();
  });

  test("shows the running batch in the band", () => {
    render(<AppShell batch={{ stage: "full", total: 2, done: 0, startedAt: "x", current: null, aborting: false }}>본문</AppShell>);
    expect(within(screen.getByRole("banner")).getByRole("status")).toHaveTextContent("2개사 분석 중");
  });
  test("draws the header edge with the hairline token — the band is paper coloured in light mode", () => {
    render(<AppShell>본문</AppShell>);
    const bar = screen.getByRole("banner").firstElementChild;

    expect(bar).toHaveClass("border-hairline");
    expect(bar?.className).not.toContain("border-band-foreground");
  });

  test("offers the theme toggle in the header", () => {
    render(<AppShell>본문</AppShell>);

    expect(within(screen.getByRole("banner")).getByRole("button", { name: "화면 테마 전환" })).toBeInTheDocument();
  });

  test("renders the account slot in the header", () => {
    render(<AppShell account={<button>로그아웃</button>}>본문</AppShell>);

    expect(within(screen.getByRole("banner")).getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });
});
