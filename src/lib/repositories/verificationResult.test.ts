import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { saveVerification, findVerification, listLatestVerifications } from "@/lib/repositories/verificationResult";
import type { VerificationOutput } from "@/lib/services/verification";

async function seedCompanyWithUser(name: string, year: number) {
  const company = await prisma.company.create({ data: { name, year } });
  const user = await prisma.user.create({
    data: { email: `v-${company.id}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return { company, user };
}

async function seedRun(input: {
  companyId: number;
  userId: number;
  status: string;
  createdAt: Date;
  news?: number;
  verification?: { status: string; faithfulness?: number; counterEvidence?: string[] };
}) {
  const run = await prisma.analysisRun.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      model: "claude-sonnet-5",
      status: input.status,
      createdAt: input.createdAt,
      completedAt: input.status === "completed" ? input.createdAt : null,
      newsJson: JSON.stringify(Array.from({ length: input.news ?? 0 }, (_, i) => ({ link: `https://n/${i}` }))),
    },
  });
  if (input.verification) {
    await prisma.verificationResult.create({
      data: {
        analysisRunId: run.id,
        status: input.verification.status,
        faithfulness: input.verification.faithfulness ?? null,
        unsupportedClaims: "[]",
        counterEvidence: JSON.stringify(input.verification.counterEvidence ?? []),
        detailJson: "{}",
      },
    });
  }
  return run;
}

function output(patch: Partial<VerificationOutput> = {}): VerificationOutput {
  return {
    status: "verified",
    faithfulness: 1,
    sourceCoverage: 1,
    evidenceMatch: 0.7,
    unsupportedClaims: [],
    counterEvidence: ["단일 출처에 의존한 보도입니다"],
    usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0 },
    detail: { layer1: { coverage: 1, cited: 1, total: 1, invalid: [] }, layer2: null, layer3: 0.7 },
    ...patch,
  };
}

describe("verification result repository", () => {
  beforeEach(resetDatabase);

  it("stores the verdict with every score behind it", async () => {
    const { company, user } = await seedCompanyWithUser("넷록스", 2024);
    const run = await seedRun({ companyId: company.id, userId: user.id, status: "completed", createdAt: new Date() });

    const saved = await saveVerification(run.id, output());

    expect(saved.status).toBe("verified");
    expect(saved.faithfulness).toBe(1);
    expect(saved.evidenceMatch).toBeCloseTo(0.7);
  });

  it("keeps the counter evidence readable for the committee", async () => {
    const { company, user } = await seedCompanyWithUser("넷록스", 2024);
    const run = await seedRun({ companyId: company.id, userId: user.id, status: "completed", createdAt: new Date() });

    const saved = await saveVerification(run.id, output());

    expect(JSON.parse(saved.counterEvidence)).toEqual(["단일 출처에 의존한 보도입니다"]);
  });

  it("stores a null faithfulness when the judge failed rather than a zero", async () => {
    const { company, user } = await seedCompanyWithUser("넷록스", 2024);
    const run = await seedRun({ companyId: company.id, userId: user.id, status: "completed", createdAt: new Date() });

    const saved = await saveVerification(
      run.id,
      output({ status: "needs_review", faithfulness: null }),
    );

    expect(saved.faithfulness).toBeNull();
    expect(saved.status).toBe("needs_review");
  });

  it("replaces the previous verdict when an analysis is re-verified", async () => {
    const { company, user } = await seedCompanyWithUser("넷록스", 2024);
    const run = await seedRun({ companyId: company.id, userId: user.id, status: "completed", createdAt: new Date() });
    await saveVerification(run.id, output());

    await saveVerification(run.id, output({ status: "needs_review", faithfulness: 0.4 }));

    expect(await prisma.verificationResult.count()).toBe(1);
    expect((await findVerification(run.id))?.status).toBe("needs_review");
  });

  it("returns nothing for a run that was never verified", async () => {
    const { company, user } = await seedCompanyWithUser("넷록스", 2024);
    const run = await seedRun({ companyId: company.id, userId: user.id, status: "completed", createdAt: new Date() });

    expect(await findVerification(run.id)).toBeNull();
  });
});

describe("listLatestVerifications", () => {
  beforeEach(resetDatabase);

  it("returns one row per company from its newest completed run", async () => {
    const { company, user } = await seedCompanyWithUser("크립토랩", 2025);
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-01"), news: 3,
      verification: { status: "needs_review", faithfulness: 0.6 },
    });
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-20"), news: 5,
      verification: { status: "verified", faithfulness: 0.9, counterEvidence: ["반증 1"] },
    });

    const rows = await listLatestVerifications(2025);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      companyId: company.id, status: "verified", faithfulness: 0.9, citations: 5, counterEvidence: 1,
    });
    expect(rows[0].runAt).toBe(new Date("2026-08-20").toISOString());
  });

  it("skips runs that are still running or failed", async () => {
    const { company, user } = await seedCompanyWithUser("옥타코", 2025);
    await seedRun({
      companyId: company.id, userId: user.id, status: "completed",
      createdAt: new Date("2026-08-01"), verification: { status: "verified", faithfulness: 0.9 },
    });
    await seedRun({ companyId: company.id, userId: user.id, status: "running", createdAt: new Date("2026-08-25") });

    const rows = await listLatestVerifications(2025);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("verified");
  });

  it("leaves out a completed run that has no verification and other years", async () => {
    const a = await seedCompanyWithUser("아크릴", 2025);
    await seedRun({ companyId: a.company.id, userId: a.user.id, status: "completed", createdAt: new Date("2026-08-01") });
    const b = await seedCompanyWithUser("셀바스", 2024);
    await seedRun({
      companyId: b.company.id, userId: b.user.id, status: "completed",
      createdAt: new Date("2026-08-01"), verification: { status: "verified" },
    });

    expect(await listLatestVerifications(2025)).toEqual([]);
  });
});
