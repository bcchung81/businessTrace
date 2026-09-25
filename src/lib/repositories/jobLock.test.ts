import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { acquireJobLock, releaseJobLock, releaseJobLocksHeldBy, renewJobLock } from "@/lib/repositories/jobLock";

const T0 = new Date("2026-09-26T03:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const TEN_MINUTES = 10 * 60_000;

describe("job lock", () => {
  beforeEach(resetDatabase);

  it("keeps a second holder out until the first one's lease runs out, then hands it over", async () => {
    expect(await acquireJobLock("batch", "scheduled:1", TEN_MINUTES, T0)).toBe(true);
    expect(await acquireJobLock("batch", "web:2", TEN_MINUTES, later(TEN_MINUTES - 1))).toBe(false);
    expect(await acquireJobLock("batch", "web:2", TEN_MINUTES, later(TEN_MINUTES + 1))).toBe(true);

    const row = await prisma.jobLock.findUniqueOrThrow({ where: { name: "batch" } });
    expect(row.holder).toBe("web:2");
    expect(row.expiresAt.getTime()).toBe(later(2 * TEN_MINUTES + 1).getTime());
  });

  it("locks each job name on its own", async () => {
    expect(await acquireJobLock("batch", "scheduled:1", TEN_MINUTES, T0)).toBe(true);
    expect(await acquireJobLock("pension", "scheduled:1", TEN_MINUTES, T0)).toBe(true);
  });

  it("extends the lease only for the holder", async () => {
    await acquireJobLock("batch", "scheduled:1", TEN_MINUTES, T0);

    expect(await renewJobLock("batch", "web:2", TEN_MINUTES, later(60_000))).toBe(false);
    expect(await renewJobLock("batch", "scheduled:1", TEN_MINUTES, later(9 * 60_000))).toBe(true);
    expect(await acquireJobLock("batch", "web:2", TEN_MINUTES, later(TEN_MINUTES + 1))).toBe(false);
  });

  it("lets only the holder release it", async () => {
    await acquireJobLock("batch", "scheduled:1", TEN_MINUTES, T0);

    await releaseJobLock("batch", "web:2");
    expect(await prisma.jobLock.count()).toBe(1);

    await releaseJobLock("batch", "scheduled:1");
    expect(await prisma.jobLock.count()).toBe(0);
  });

  it("drops every lock a restarted process left behind and keeps the others", async () => {
    await acquireJobLock("batch", "web:41", TEN_MINUTES, T0);
    await acquireJobLock("pension", "scheduled:7", TEN_MINUTES, T0);

    expect(await releaseJobLocksHeldBy("web:")).toBe(1);
    expect((await prisma.jobLock.findMany()).map((row) => row.name)).toEqual(["pension"]);
  });
});
