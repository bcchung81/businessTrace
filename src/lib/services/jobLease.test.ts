import { describe, expect, it, vi } from "vitest";
import { holdJobLock } from "@/lib/services/jobLease";

vi.mock("@/lib/services/logger", () => ({ logEvent: vi.fn() }));

function fakeDeps(acquired: boolean, renewed = true) {
  let tick: (() => void) | null = null;
  return {
    acquire: vi.fn(async () => acquired),
    renew: vi.fn(async () => renewed),
    release: vi.fn(async () => {}),
    setInterval: vi.fn((callback: () => void) => {
      tick = callback;
      return 7 as unknown as ReturnType<typeof setInterval>;
    }),
    clearInterval: vi.fn(),
    tick: () => tick?.(),
  };
}

describe("holdJobLock", () => {
  it("returns null and starts no heartbeat when someone else holds the lock", async () => {
    const deps = fakeDeps(false);

    expect(await holdJobLock("batch", "web:1", deps)).toBeNull();
    expect(deps.setInterval).not.toHaveBeenCalled();
  });

  it("keeps renewing a short lease while held, so a crashed holder frees the lock within minutes", async () => {
    const deps = fakeDeps(true);

    await holdJobLock("batch", "web:1", deps);
    deps.tick();

    expect(deps.acquire).toHaveBeenCalledWith("batch", "web:1", 10 * 60_000);
    expect(deps.renew).toHaveBeenCalledWith("batch", "web:1", 10 * 60_000);
  });

  it("stops the heartbeat and releases on the returned handle", async () => {
    const deps = fakeDeps(true);

    const release = await holdJobLock("batch", "web:1", deps);
    await release!();

    expect(deps.clearInterval).toHaveBeenCalledWith(7);
    expect(deps.release).toHaveBeenCalledWith("batch", "web:1");
  });

  it("logs when the lease was lost — another holder may already be running the same job", async () => {
    const { logEvent } = await import("@/lib/services/logger");
    const deps = fakeDeps(true, false);

    await holdJobLock("batch", "web:1", deps);
    deps.tick();

    await vi.waitFor(() => expect(logEvent).toHaveBeenCalledWith("warn", "job_lock.lost", { name: "batch", holder: "web:1" }));
  });
});
