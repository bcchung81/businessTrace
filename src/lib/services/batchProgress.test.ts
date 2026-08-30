import { describe, expect, test } from "vitest";
import { INITIAL_BATCH, reduceBatch, stepOf, STEP_ORDER, type BatchState } from "@/lib/services/batchProgress";

function feed(events: unknown[]) {
  return events.reduce<BatchState>((state, event) => reduceBatch(state, event), INITIAL_BATCH);
}

describe("reduceBatch", () => {
  test("tracks each company through collect → analyze → verify → report", () => {
    let state = feed([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
    ]);
    expect(state.phase).toBe("running");
    expect(stepOf(state.companies[0])).toBe("collect");
    state = reduceBatch(state, { type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 1, total: 4 } });
    expect(stepOf(state.companies[0])).toBe("analyze");
    state = reduceBatch(state, { type: "company_event", companyId: 1, event: { type: "verifying", runId: 5 } });
    expect(stepOf(state.companies[0])).toBe("verify");
    state = reduceBatch(state, { type: "company_done", companyId: 1, status: "verified", articles: 4 });
    expect(stepOf(state.companies[0])).toBe("report");
    expect(state.companies[0]).toMatchObject({ status: "verified", articles: 4 });
    state = reduceBatch(state, { type: "batch_done", done: 1, total: 1, aborted: false });
    expect(state).toMatchObject({ phase: "done", done: 1, aborted: false });
  });

  test("writes a log line for skips, rate limits and verification scores", () => {
    const state = feed([
      { type: "batch_start", total: 2, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      {
        type: "company_event",
        companyId: 1,
        event: {
          type: "verified",
          runId: 5,
          verification: {
            status: "verified", faithfulness: 0.92, sourceCoverage: 1, evidenceMatch: 0.7, unsupportedClaims: [], counterEvidence: [],
            usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
            detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: null, layer3: 0.7 },
          },
        },
      },
      { type: "company_done", companyId: 1, status: "verified", articles: 3 },
      { type: "company_start", companyId: 2, name: "㈜나", index: 1 },
      { type: "company_done", companyId: 2, status: "skipped", message: "이미 검증됨" },
    ]);
    const text = state.log.map((entry) => entry.text);
    expect(text).toContainEqual("㈜가 · 검증 통과 · 충실도 0.92");
    expect(text).toContainEqual("㈜나 · 건너뜀 — 이미 검증됨");
    expect(state.log.find((entry) => entry.text.includes("건너뜀"))?.level).toBe("warn");
  });

  test("collect-only and sources-only stages stop at their own step", () => {
    const news = feed([
      { type: "batch_start", total: 1, stage: "news" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_done", companyId: 1, status: "collected", articles: 7 },
    ]);
    expect(stepOf(news.companies[0])).toBe("collect");
    const sources = feed([
      { type: "batch_start", total: 1, stage: "sources" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_done", companyId: 1, status: "sources_done" },
    ]);
    expect(stepOf(sources.companies[0])).toBe("report");
    expect(STEP_ORDER).toEqual(["collect", "analyze", "verify", "report"]);
  });
});
