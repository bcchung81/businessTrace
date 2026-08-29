import { describe, it, expect } from "vitest";
import { createSseParser, createSseSink } from "@/lib/services/sse";

describe("createSseParser", () => {
  it("reads one complete event out of a chunk", () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":"verifying"}\n\n')).toEqual([{ type: "verifying" }]);
  });

  it("reads every event a single chunk happens to carry", () => {
    const parser = createSseParser();

    const events = parser.push('data: {"type":"a"}\n\ndata: {"type":"b"}\n\n');

    expect(events).toEqual([{ type: "a" }, { type: "b" }]);
  });

  it("holds a half-arrived event until the rest of it lands", () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":"prog')).toEqual([]);
    expect(parser.push('ress","current":3}\n\n')).toEqual([{ type: "progress", current: 3 }]);
  });

  it("keeps the leftover of a chunk that ends mid-event", () => {
    const parser = createSseParser();

    const first = parser.push('data: {"type":"a"}\n\ndata: {"type":"b"');

    expect(first).toEqual([{ type: "a" }]);
    expect(parser.push("}\n\n")).toEqual([{ type: "b" }]);
  });

  it("ignores comment and field lines that are not data", () => {
    const parser = createSseParser();

    expect(parser.push(': keep-alive\n\nevent: ping\n\n')).toEqual([]);
  });

  it("drops an event whose payload is not valid JSON instead of throwing", () => {
    const parser = createSseParser();

    expect(parser.push("data: not-json\n\n")).toEqual([]);
  });

  it("joins a payload the server split across data lines", () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":\ndata: "split"}\n\n')).toEqual([{ type: "split" }]);
  });
});

describe("createSseSink", () => {
  function controller() {
    const chunks: string[] = [];
    let closed = 0;
    return {
      chunks,
      closes: () => closed,
      enqueue: (chunk: Uint8Array) => chunks.push(new TextDecoder().decode(chunk)),
      close: () => {
        closed += 1;
      },
    };
  }

  it("writes an event as an SSE data frame", () => {
    const target = controller();
    createSseSink(target).send({ type: "collected" });

    expect(target.chunks).toEqual(['data: {"type":"collected"}\n\n']);
  });

  it("stops writing once the consumer has gone, instead of throwing on a dead controller", () => {
    const target = controller();
    const sink = createSseSink(target);

    sink.drop();
    sink.send({ type: "progress" });

    expect(target.chunks).toEqual([]);
    expect(sink.open).toBe(false);
  });

  it("does not close a stream the consumer already cancelled", () => {
    const target = controller();
    const sink = createSseSink(target);

    sink.drop();
    sink.close();

    expect(target.closes()).toBe(0);
  });

  it("closes once even if asked twice", () => {
    const target = controller();
    const sink = createSseSink(target);

    sink.close();
    sink.close();

    expect(target.closes()).toBe(1);
  });
})
