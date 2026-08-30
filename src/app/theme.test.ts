import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("dark theme follows the system setting", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("layout toggles the dark class from prefers-color-scheme before first paint", () => {
    expect(layout).toContain("prefers-color-scheme: dark");
    expect(layout).toMatch(/classList\.toggle\(\s*["']dark["']/);
    expect(layout).toContain('suppressHydrationWarning');
  });

  test("declares both colour schemes so form controls and scrollbars follow", () => {
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark/);
  });
});
