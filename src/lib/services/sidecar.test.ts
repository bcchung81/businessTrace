import { afterEach, describe, expect, it, vi } from "vitest";
import { sidecarHealth } from "@/lib/services/sidecar";

const original = process.env.SIDECAR_URL;

afterEach(() => {
  if (original === undefined) delete process.env.SIDECAR_URL;
  else process.env.SIDECAR_URL = original;
});

describe("sidecarHealth", () => {
  it("reads what the sidecar reports, including which extras it has", async () => {
    process.env.SIDECAR_URL = "http://sidecar:8000";
    const fetchImpl = vi.fn(async () => Response.json({ status: "ok", features: { research: true } })) as unknown as typeof fetch;

    expect(await sidecarHealth({ fetchImpl })).toEqual({ status: "ok", features: { research: true } });
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toBe("http://sidecar:8000/health");
  });

  it("returns null instead of throwing when the sidecar is down — it is an optional layer", async () => {
    process.env.SIDECAR_URL = "http://sidecar:8000";
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await sidecarHealth({ fetchImpl })).toBeNull();
  });

  it("returns null on a non-2xx rather than reading an error body as health", async () => {
    process.env.SIDECAR_URL = "http://sidecar:8000";
    const fetchImpl = vi.fn(async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;

    expect(await sidecarHealth({ fetchImpl })).toBeNull();
  });

  it("does not call anything when no sidecar is configured", async () => {
    delete process.env.SIDECAR_URL;
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    expect(await sidecarHealth({ fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
