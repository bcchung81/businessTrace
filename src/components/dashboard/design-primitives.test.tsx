import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SectionHead } from "@/components/dashboard/section-head";
import { Panel } from "@/components/dashboard/panel";
import { StateLegend } from "@/components/dashboard/state-legend";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STATUS_TOKENS = [
  "--verified", "--verified-surface", "--verified-fill",
  "--review", "--review-surface", "--review-fill",
  "--risk", "--risk-surface", "--risk-fill",
  "--pending", "--pending-surface", "--pending-fill",
];

function cssBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

describe("status tokens", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("defines text, surface and fill for every status in light and dark", () => {
    for (const selector of [":root", ".dark"]) {
      const block = cssBlock(css, selector);
      for (const token of STATUS_TOKENS) {
        expect(block, `${selector} ${token}`).toMatch(new RegExp(`${token}:\\s*#`));
      }
    }
  });

  test("exposes fill and pending tokens as Tailwind colours", () => {
    for (const name of ["verified-fill", "review-fill", "risk-fill", "pending", "pending-surface", "pending-fill"]) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });

  test("moves review text off brown so it reads as the same family as its fill", () => {
    expect(cssBlock(css, ":root")).not.toContain("--review: #b36600");
  });
});

describe("signal skin tokens", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("defines the band, ink and hairline in light and dark", () => {
    for (const selector of [":root", ".dark"]) {
      const block = cssBlock(css, selector);
      for (const token of ["--band", "--band-foreground", "--ink", "--hairline", "--surface"]) {
        expect(block, `${selector} ${token}`).toMatch(new RegExp(`${token}:\\s*#`));
      }
    }
  });

  test("keeps the band one step darker than the dark background so the header still reads", () => {
    const dark = cssBlock(css, ".dark");
    expect(dark).toContain("--background: #0f1523");
    expect(dark).toContain("--band: #060a14");
  });

  test("exposes the skin as Tailwind theme keys and drops the comic layer", () => {
    for (const line of [
      "--color-band: var(--band);",
      "--color-band-foreground: var(--band-foreground);",
      "--color-ink: var(--ink);",
      "--color-hairline: var(--hairline);",
      '--font-display: var(--font-gothic-a1), "Pretendard Variable"',
    ]) {
      expect(css).toContain(line);
    }
    for (const gone of ["--shadow-hard", "--paper", ".paper-grain", ".cut-top", "ribbon-drift", "--font-hangul-display", "--font-anton"]) {
      expect(css).not.toContain(gone);
    }
  });

  test("keeps the hatch for missing values", () => {
    expect(css).toContain(".hatch {");
  });
});

describe("root layout font", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

  test("self-hosts Gothic A1 under --font-gothic-a1 with the black weight for display", () => {
    expect(layout).toContain('from "next/font/google"');
    expect(layout).toMatch(/Gothic_A1\(\{[^}]*variable:\s*"--font-gothic-a1"/);
    expect(layout).toMatch(/Gothic_A1\(\{[^}]*"900"/);
    expect(layout).toContain("gothicA1.variable");
    expect(layout).not.toContain("Anton");
    expect(layout).not.toContain("Black+Han+Sans");
  });
});

describe("SectionHead", () => {
  test("puts the heading, its tag and its note in one block", () => {
    render(<SectionHead title="구분별 요약" tag="실측" note="구분으로 먼저 접는다" />);

    expect(screen.getByRole("heading", { level: 2, name: "구분별 요약" })).toBeInTheDocument();
    expect(screen.getByText("실측")).toBeInTheDocument();
    expect(screen.getByText("구분으로 먼저 접는다")).toBeInTheDocument();
  });

  test("works without a tag or a note", () => {
    render(<SectionHead title="뉴스 언급 근거" />);

    expect(screen.getByRole("heading", { level: 2, name: "뉴스 언급 근거" })).toBeInTheDocument();
  });
});

describe("SectionHead index", () => {
  test("prints the section number before the heading", () => {
    render(<SectionHead index="04" title="기업별 근거 매트릭스" />);

    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "기업별 근거 매트릭스" })).toBeInTheDocument();
  });
});

describe("Panel", () => {
  test("renders head, aside, body and footer in one card", () => {
    render(
      <Panel index="01" title="판정 현황" tag="분석 산출" tone="fresh" aside={<span>정렬</span>} footer={<span>범례</span>}>
        <p>본문</p>
      </Panel>,
    );

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "판정 현황" })).toBeInTheDocument();
    expect(screen.getByText("정렬")).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(screen.getByText("범례")).toBeInTheDocument();
  });

  test("shows the empty label instead of a card when there is no body", () => {
    render(<Panel title="최근 기사" empty="수집된 기사가 없습니다.">{null}</Panel>);

    expect(screen.getByText("수집된 기사가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-footer")).not.toBeInTheDocument();
  });

  test("omits the footer strip when none is given", () => {
    render(<Panel title="최근 기사"><p>본문</p></Panel>);

    expect(screen.queryByTestId("panel-footer")).not.toBeInTheDocument();
  });

  test("opens with a thick top rule instead of a boxed card", () => {
    render(<Panel title="판정 현황"><p>본문</p></Panel>);
    const section = screen.getByRole("heading", { level: 2, name: "판정 현황" }).closest("section");
    const card = screen.getByText("본문").parentElement?.parentElement;

    expect(section).toHaveClass("border-t-4", "border-ink");
    expect(card).not.toHaveClass("shadow-hard", "border-2");
  });
});


describe("StateLegend", () => {
  test("names all four kinds of blank so none reads as the others", () => {
    render(<StateLegend />);

    for (const label of ["확인", "결측", "측정 불가", "미조회", "충돌"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  test("explains what each kind means rather than showing colour alone", () => {
    render(<StateLegend />);

    expect(screen.getByText(/원천에 이 기업이 없다/)).toBeInTheDocument();
    expect(screen.getByText(/잴 활동이 없다/)).toBeInTheDocument();
  });
});
