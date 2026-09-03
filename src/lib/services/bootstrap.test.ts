import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { closeStaleRuns } from "@/lib/services/bootstrap";

async function seedRun(status: string) {
  const company = await prisma.company.create({ data: { name: `c-${status}-${Math.random()}`, year: 2026 } });
  const user = await prisma.user.create({ data: { email: `b-${company.id}@example.com`, passwordHash: "x" } });
  return prisma.analysisRun.create({
    data: { companyId: company.id, userId: user.id, model: "m", newsJson: "[]", status },
  });
}

describe("closeStaleRuns", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("fails a run that was left running by a restart — nothing is going to finish it", async () => {
    const stale = await seedRun("running");

    expect(await closeStaleRuns()).toBe(1);
    const after = await prisma.analysisRun.findUnique({ where: { id: stale.id } });
    expect(after?.status).toBe("failed");
    expect(after?.completedAt).not.toBeNull();
    expect(String(after?.resultJson)).toContain("재기동");
  });

  it("leaves finished runs alone", async () => {
    const done = await seedRun("completed");
    const collected = await seedRun("collected");

    expect(await closeStaleRuns()).toBe(0);
    expect((await prisma.analysisRun.findUnique({ where: { id: done.id } }))?.status).toBe("completed");
    expect((await prisma.analysisRun.findUnique({ where: { id: collected.id } }))?.status).toBe("collected");
  });

  it("says nothing and does nothing when the table is clean", async () => {
    expect(await closeStaleRuns()).toBe(0);
  });
});
