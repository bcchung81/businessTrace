import { beforeEach, describe, expect, test } from "vitest";
import { advanceBatch, finishBatch, readBatch, startBatch } from "@/lib/services/batchRegistry";

describe("batchRegistry", () => {
  beforeEach(finishBatch);

  test("holds one running batch and refuses a second", () => {
    expect(readBatch()).toBeNull();
    startBatch({ stage: "full", total: 3, now: new Date("2026-08-30T03:00:00Z") });
    expect(readBatch()).toEqual({ stage: "full", total: 3, done: 0, startedAt: "2026-08-30T03:00:00.000Z", current: null });
    expect(() => startBatch({ stage: "news", total: 1 })).toThrow("already_running");
  });

  test("advances and clears", () => {
    startBatch({ stage: "full", total: 2 });
    advanceBatch({ done: 1, current: "㈜가" });
    expect(readBatch()).toMatchObject({ done: 1, current: "㈜가" });
    finishBatch();
    expect(readBatch()).toBeNull();
    expect(() => advanceBatch({ done: 2 })).not.toThrow();
  });
});
