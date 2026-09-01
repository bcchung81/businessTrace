import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("theme opens light and remembers the operator's choice", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("applies the stored choice before first paint so light never flashes", () => {
    expect(layout).toContain("localStorage.getItem('theme')");
    expect(layout).toMatch(/classList\.add\(\s*['"]dark['"]/);
    expect(layout).toContain("suppressHydrationWarning");
  });

  test("ignores the operating system setting — light is the default, not a fallback", () => {
    expect(layout).not.toContain("prefers-color-scheme");
  });

  test("declares both colour schemes so form controls and scrollbars follow", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/);
  });
});
