import { beforeEach, describe, expect, test } from "vitest";
import { closeBatchStream, finishBatch, startBatch, subscribeBatch } from "@/lib/services/batchRegistry";
import { launchBatch } from "@/lib/services/batchSession";

async function* source(events: unknown[], fail = false) {
  startBatch({ stage: "full", total: 1 });
  try {
    for (const event of events) yield event;
    if (fail) throw new Error("boom");
  } finally {
    finishBatch();
  }
}

describe("launchBatch", () => {
  beforeEach(() => {
    finishBatch();
    closeBatchStream();
  });

  test("publishes every event and closes the stream when the generator ends", async () => {
    const seen: unknown[] = [];
    await launchBatch(source([{ type: "batch_start" }, { type: "batch_done" }]));
    subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start" }, { type: "batch_done" }, null]);
  });

  test("a thrown error becomes an error event and still closes the stream", async () => {
    const seen: unknown[] = [];
    await launchBatch(source([{ type: "batch_start" }], true));
    subscribeBatch((event) => seen.push(event));
    expect(seen).toEqual([{ type: "batch_start" }, { type: "error", message: "boom" }, null]);
  });
});
