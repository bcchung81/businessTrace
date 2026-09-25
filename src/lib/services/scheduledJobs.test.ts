import { describe, expect, it } from "vitest";
import { collectCommands, lockNameFor, newsBatchOptions, parseJob, resolveNewsStage } from "@/lib/services/scheduledJobs";

describe("parseJob", () => {
  it("accepts the four scheduled jobs and throws on anything else — a typo must not run nothing silently", () => {
    expect(parseJob("pension")).toBe("pension");
    expect(() => parseJob("pensoin")).toThrow(/news\|pension\|procurement\|venture/);
    expect(() => parseJob(undefined)).toThrow();
  });
});

describe("resolveNewsStage", () => {
  it("collects news only by default so the nightly run spends no LLM tokens", () => {
    expect(resolveNewsStage({})).toBe("news");
    expect(resolveNewsStage({ SCHEDULE_NEWS_STAGE: " FULL " })).toBe("full");
    expect(resolveNewsStage({ SCHEDULE_NEWS_STAGE: "off" })).toBe("off");
  });

  it("throws on an unknown stage instead of falling back", () => {
    expect(() => resolveNewsStage({ SCHEDULE_NEWS_STAGE: "ful" })).toThrow(/SCHEDULE_NEWS_STAGE/);
  });
});

describe("lockNameFor", () => {
  it("shares the web batch lock for news, since both collect and analyse the same companies", () => {
    expect(lockNameFor("news")).toBe("batch");
    expect(lockNameFor("pension")).toBe("pension");
  });
});

describe("collectCommands", () => {
  it("runs the pension scan once per evaluation year", () => {
    expect(collectCommands("pension", [2024, 2025])).toEqual([
      ["scripts/collect-pension.ts", "2024"],
      ["scripts/collect-pension.ts", "2025"],
    ]);
  });

  it("scans procurement over twelve months and venture once for every active company", () => {
    expect(collectCommands("procurement", [2024, 2025])).toEqual([["scripts/collect-procurement.ts", "12"]]);
    expect(collectCommands("venture", [2024, 2025])).toEqual([["scripts/collect-venture.ts"]]);
  });

  it("has no child command for news — it runs the batch in process", () => {
    expect(collectCommands("news", [2025])).toEqual([]);
  });
});

describe("newsBatchOptions", () => {
  const now = new Date("2026-09-26T03:30:00Z");

  it("uses the same window and article cap as the batch screen", () => {
    expect(newsBatchOptions("news", now)).toMatchObject({ stage: "news", startDate: "2026-06-28", limit: 20, naver: true, google: true });
  });

  it("re-analyses verified companies too when the nightly stage is full — otherwise it would skip them all", () => {
    expect(newsBatchOptions("full", now).force).toBe(true);
    expect(newsBatchOptions("news", now).force).toBe(false);
  });
});
