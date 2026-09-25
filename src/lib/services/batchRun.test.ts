import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishBatch, readBatch } from "@/lib/services/batchRegistry";
import { runCompanyAnalysis } from "@/lib/services/analysisPipeline";
import { runBatch, type BatchDeps, type BatchEvent, type BatchTarget } from "@/lib/services/batchRun";
import { NewsRateLimitError } from "@/lib/services/newsCollector";
import type { NewsItem } from "@/lib/services/newsTypes";

const item: NewsItem = { title: "t", link: "https://n/1", description: "", content: "", published: "2026-08-01", source: "s", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" };
const collected = () => ({ items: [item], duplicatesRemoved: 0, blockedRemoved: 0, errors: [] as string[], primaryCount: 1, noNews: false });
const targets: BatchTarget[] = [
  { id: 1, name: "㈜가", year: 2026, businessNo: "1", verified: false, aliases: null },
  { id: 2, name: "㈜나", year: 2026, businessNo: null, verified: true, aliases: null },
];
const options = { stage: "full" as const, limit: 20, force: false, naver: true, google: true };

function deps(over: Partial<BatchDeps> = {}): BatchDeps {
  return {
    userId: 1,
    pipeline: { model: "m", analyze: vi.fn(), verify: vi.fn() },
    collect: vi.fn(async () => collected()),
    collectOnly: vi.fn(async () => ({})),
    refreshSources: vi.fn(async () => ({})),
    ...over,
  };
}

async function drain(gen: AsyncGenerator<BatchEvent>) {
  const events: BatchEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

vi.mock("@/lib/services/analysisPipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/services/analysisPipeline")>();
  return {
    ...original,
    runCompanyAnalysis: vi.fn(async (input, pipelineDeps) => {
      pipelineDeps.onEvent?.({ type: "progress", step: "trend", current: 1, total: 1 });
      return { runId: 10 + input.company.id, status: "verified", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
    }),
  };
});

describe("runBatch", () => {
  beforeEach(finishBatch);

  test("runs companies in order, relays pipeline events, skips verified ones without --force", async () => {
    const events = await drain(runBatch(targets, options, deps()));
    expect(events[0]).toEqual({ type: "batch_start", total: 2, stage: "full" });
    expect(events).toContainEqual({ type: "company_start", companyId: 1, name: "㈜가", index: 0 });
    expect(events).toContainEqual({ type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 1, total: 1 } });
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "verified", articles: 1 });
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "skipped", message: "이미 검증됨" });
    expect(events.at(-1)).toEqual({ type: "batch_done", done: 2, total: 2, aborted: false });
    expect(readBatch()).toBeNull();
  });

  test("with force it analyses verified companies too", async () => {
    const events = await drain(runBatch(targets, { ...options, force: true }, deps()));
    expect(events.filter((e) => e.type === "company_done").map((e) => (e as { status: string }).status)).toEqual(["verified", "verified"]);
  });

  test("news stage collects and stores without touching the pipeline", async () => {
    const d = deps();
    const events = await drain(runBatch(targets, { ...options, stage: "news", force: true }, d));
    expect(d.collectOnly).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "collected", articles: 1 });
  });

  test("sources stage refreshes official sources only", async () => {
    const d = deps();
    const events = await drain(runBatch(targets, { ...options, stage: "sources", force: true }, d));
    expect(d.refreshSources).toHaveBeenCalledTimes(2);
    expect(d.collect).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "sources_done" });
  });

  test("a rate limit closes the rest as aborted and ends the batch", async () => {
    const d = deps({
      collect: vi.fn(async () => {
        throw new NewsRateLimitError("한도");
      }),
    });
    const events = await drain(runBatch(targets, { ...options, force: true }, d));
    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "rate_limited", message: "한도" });
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "aborted", message: "레이트리밋으로 중단" });
    expect(events.at(-1)).toEqual({ type: "batch_done", done: 1, total: 2, aborted: true });
  });

  test("with concurrency 2 the next company starts while the first is still collecting", async () => {
    let inFlight = 0;
    let peak = 0;
    const d = deps({
      collect: vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return collected();
      }),
    });
    const events = await drain(runBatch(targets, { ...options, force: true, concurrency: 2 }, d));
    expect(peak).toBe(2);
    expect(events.filter((e) => e.type === "company_done")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "batch_done", done: 2, total: 2, aborted: false });
  });

  test("streams a company's pipeline events while that company is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.mocked(runCompanyAnalysis).mockImplementationOnce(async (_input, pipelineDeps) => {
      pipelineDeps.onEvent?.({ type: "progress", step: "trend", current: 1, total: 1 });
      await gate;
      return { runId: 11, status: "verified", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 } };
    });
    let releasedByTimer = false;
    const timer = setTimeout(() => {
      releasedByTimer = true;
      release();
    }, 200);
    let arrivedWhileRunning = false;
    for await (const event of runBatch([targets[0]], { ...options, force: true }, deps())) {
      if (event.type === "company_event") {
        arrivedWhileRunning = !releasedByTimer;
        release();
      }
    }
    clearTimeout(timer);
    expect(arrivedWhileRunning).toBe(true);
  });

  test("while running, the registry names every company in flight", async () => {
    const seen: (string | null)[] = [];
    const d = deps({
      collect: vi.fn(async () => {
        seen.push(readBatch()?.current ?? null);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return collected();
      }),
    });
    await drain(runBatch(targets, { ...options, force: true, concurrency: 2 }, d));
    expect(seen).toContain("㈜가 · ㈜나");
  });

  test("stops after the current company when the client is gone", async () => {
    let open = true;
    const d = deps({
      isOpen: () => open,
      collect: vi.fn(async () => {
        open = false;
        return collected();
      }),
    });
    const events = await drain(runBatch(targets, { ...options, force: true }, d));
    expect(events.filter((e) => e.type === "company_start")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "batch_done", aborted: true, done: 1 });
  });

  test("logs how long each company spent collecting and in the pipeline", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => void lines.push(String(line)));
    await drain(runBatch(targets, { ...options, force: true }, deps()));
    spy.mockRestore();

    const timings = lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === "batch.company_timing");
    expect(timings.map((entry) => entry.companyId)).toEqual([1, 2]);
    expect(timings[0]).toMatchObject({ name: "㈜가", stage: "full", status: "verified" });
    for (const entry of timings) {
      for (const key of ["collectMs", "pipelineMs", "totalMs"]) expect(typeof entry[key]).toBe("number");
    }
  });

  test("refuses to start while another batch runs", async () => {
    const first = runBatch(targets, options, deps());
    await first.next();
    await expect(drain(runBatch(targets, options, deps()))).rejects.toThrow("already_running");
    await drain(first);
  });
});

describe("runBatch survives a step that throws", () => {
  beforeEach(finishBatch);

  test("keeps going when refreshing one company's sources throws", async () => {
    let calls = 0;
    const events = await drain(
      runBatch(targets, { ...options, stage: "sources" }, deps({
        refreshSources: vi.fn(async () => {
          calls += 1;
          if (calls === 1) throw new Error("data.go.kr 500");
          return {};
        }),
      })),
    );

    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "failed", message: "data.go.kr 500" });
    expect(events).toContainEqual({ type: "company_done", companyId: 2, status: "sources_done" });
    expect(events.at(-1)).toEqual({ type: "batch_done", done: 2, total: 2, aborted: false });
  });

  test("keeps going when storing one company's collection throws", async () => {
    const events = await drain(
      runBatch(targets, { ...options, stage: "news" }, deps({
        collectOnly: vi.fn(async ({ companyId }) => {
          if (companyId === 1) throw new Error("SQLITE_BUSY");
          return {};
        }),
      })),
    );

    expect(events).toContainEqual({ type: "company_done", companyId: 1, status: "failed", message: "SQLITE_BUSY" });
    expect(events.some((event) => event.type === "company_done" && event.companyId === 2 && event.status === "collected")).toBe(true);
  });
});

describe("runBatch preparation step", () => {
  beforeEach(finishBatch);

  test("runs the slow preparation after the first event so the request can return 202", async () => {
    const order: string[] = [];
    const gen = runBatch(targets, options, deps({ prepare: async () => void order.push("prepare") }));

    const first = await gen.next();
    expect(first.value).toEqual({ type: "batch_start", total: 2, stage: "full" });
    expect(order).toEqual([]);

    await drain(gen);
    expect(order).toEqual(["prepare"]);
  });

  test("closes the batch instead of dying silently when preparation throws", async () => {
    const events = await drain(
      runBatch(targets, options, deps({
        prepare: async () => {
          throw new Error("corpCode zip 20MB 실패");
        },
      })),
    );

    expect(events.at(-1)).toMatchObject({ type: "batch_done", done: 0, total: 2, aborted: true });
    expect(events.some((event) => event.type === "company_start")).toBe(false);
  });
});
