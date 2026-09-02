import { beforeEach, describe, expect, test } from "vitest";
import {
  abortRequested,
  advanceBatch,
  closeBatchStream,
  finishBatch,
  hasBatchEvents,
  publishBatchEvent,
  readBatch,
  RECENT_BATCH_MS,
  requestAbort,
  startBatch,
  subscribeBatch,
} from "@/lib/services/batchRegistry";

describe("batchRegistry", () => {
  beforeEach(() => {
    finishBatch();
    closeBatchStream();
  });

  test("holds one running batch and refuses a second", () => {
    expect(readBatch()).toBeNull();
    startBatch({ stage: "full", total: 3, now: new Date("2026-08-30T03:00:00Z") });
    expect(readBatch()).toEqual({ stage: "full", total: 3, done: 0, startedAt: "2026-08-30T03:00:00.000Z", current: null, aborting: false });
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

  test("replays buffered events to a late subscriber, then streams new ones, then signals the end", () => {
    startBatch({ stage: "full", total: 1 });
    publishBatchEvent({ type: "batch_start", total: 1 });
    const seen: unknown[] = [];
    const unsubscribe = subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start", total: 1 }]);
    publishBatchEvent({ type: "company_start", companyId: 1 });
    expect(seen).toHaveLength(2);
    finishBatch();
    closeBatchStream();
    expect(seen.at(-1)).toBeNull();
    unsubscribe();
  });

  test("a subscriber after the stream closed gets the replay and the end immediately; a new batch clears the buffer", () => {
    startBatch({ stage: "news", total: 1 });
    publishBatchEvent({ type: "batch_start", total: 1 });
    finishBatch();
    closeBatchStream();
    expect(hasBatchEvents()).toBe(true);
    const seen: unknown[] = [];
    subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start", total: 1 }, null]);
    startBatch({ stage: "news", total: 2 });
    expect(hasBatchEvents()).toBe(false);
  });

  test("a listener that throws is dropped without taking the others or the buffer down", () => {
    startBatch({ stage: "full", total: 1 });
    const seen: unknown[] = [];
    let thrown = 0;
    subscribeBatch(() => {
      thrown += 1;
      throw new Error("구독자가 죽었다");
    });
    subscribeBatch((event) => seen.push(event));

    expect(() => publishBatchEvent({ type: "batch_start", total: 1 })).not.toThrow();
    expect(thrown).toBe(1);
    expect(seen).toEqual([{ type: "batch_start", total: 1 }]);

    publishBatchEvent({ type: "batch_done", done: 1 });
    expect(thrown).toBe(1);
    expect(seen).toHaveLength(2);
    expect(hasBatchEvents()).toBe(true);

    expect(() => closeBatchStream()).not.toThrow();
    expect(seen.at(-1)).toBeNull();
  });

  test("a finished batch stops replaying 30 minutes after the stream closes, and a new run resets it", () => {
    startBatch({ stage: "full", total: 1 });
    publishBatchEvent({ type: "batch_start", total: 1 });
    finishBatch();
    closeBatchStream();
    expect(hasBatchEvents()).toBe(true);
    expect(hasBatchEvents(new Date(Date.now() + RECENT_BATCH_MS + 1))).toBe(false);

    startBatch({ stage: "full", total: 1 });
    expect(hasBatchEvents()).toBe(false);
    publishBatchEvent({ type: "batch_start", total: 1 });
    closeBatchStream();
    expect(hasBatchEvents(new Date(Date.now() + RECENT_BATCH_MS + 1))).toBe(false);
  });

  test("abort is a request flag on the running batch only", () => {
    expect(requestAbort()).toBe(false);
    startBatch({ stage: "full", total: 1 });
    expect(abortRequested()).toBe(false);
    expect(requestAbort()).toBe(true);
    expect(abortRequested()).toBe(true);
    expect(readBatch()).toMatchObject({ aborting: true });
    finishBatch();
    expect(abortRequested()).toBe(false);
  });
});
