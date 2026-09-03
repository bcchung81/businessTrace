import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/services/logger";

function capture(stream: "log" | "error") {
  const lines: string[] = [];
  const spy = vi.spyOn(console, stream).mockImplementation((line: unknown) => void lines.push(String(line)));
  return { lines, spy };
}

afterEach(() => vi.restoreAllMocks());

describe("logEvent", () => {
  it("writes one JSON line an operator can grep", () => {
    const { lines } = capture("log");

    logEvent("info", "batch.start", { total: 50, stage: "full" });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "info", event: "batch.start", total: 50, stage: "full" });
  });

  it("stamps every line so a failure can be lined up with a screenshot", () => {
    const { lines } = capture("log");

    logEvent("info", "batch.start");

    expect(JSON.parse(lines[0]).ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sends errors to stderr so json-file keeps them apart", () => {
    const out = capture("log");
    const err = capture("error");

    logEvent("error", "company.failed", { companyId: 7 });

    expect(out.lines).toHaveLength(0);
    expect(JSON.parse(err.lines[0])).toMatchObject({ level: "error", event: "company.failed", companyId: 7 });
  });

  it("records an Error as message and name, never as {}", () => {
    const { lines } = capture("error");

    logEvent("error", "route.failed", { error: new Error("no such table") });

    expect(JSON.parse(lines[0]).error).toMatchObject({ name: "Error", message: "no such table" });
  });

  it("never throws on a value that cannot be serialised", () => {
    const { lines } = capture("log");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => logEvent("info", "odd", { cyclic })).not.toThrow();
    expect(lines).toHaveLength(1);
  });
});
