import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SectionHead } from "@/components/dashboard/section-head";
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
