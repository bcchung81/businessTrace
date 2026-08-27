import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { saveVerification, findVerification } from "@/lib/repositories/verificationResult";
import type { VerificationOutput } from "@/lib/services/verification";

async function seedRun() {
  const company = await prisma.company.create({ data: { name: "넷록스", year: 2024 } });
  const user = await prisma.user.create({
    data: { email: "admin@kca.kr", passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return prisma.analysisRun.create({
    data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
  });
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
    const run = await seedRun();

    const saved = await saveVerification(run.id, output());

    expect(saved.status).toBe("verified");
    expect(saved.faithfulness).toBe(1);
    expect(saved.evidenceMatch).toBeCloseTo(0.7);
  });

  it("keeps the counter evidence readable for the committee", async () => {
    const run = await seedRun();

    const saved = await saveVerification(run.id, output());

    expect(JSON.parse(saved.counterEvidence)).toEqual(["단일 출처에 의존한 보도입니다"]);
  });

  it("stores a null faithfulness when the judge failed rather than a zero", async () => {
    const run = await seedRun();

    const saved = await saveVerification(
      run.id,
      output({ status: "needs_review", faithfulness: null }),
    );

    expect(saved.faithfulness).toBeNull();
    expect(saved.status).toBe("needs_review");
  });

  it("replaces the previous verdict when an analysis is re-verified", async () => {
    const run = await seedRun();
    await saveVerification(run.id, output());

    await saveVerification(run.id, output({ status: "needs_review", faithfulness: 0.4 }));

    expect(await prisma.verificationResult.count()).toBe(1);
    expect((await findVerification(run.id))?.status).toBe("needs_review");
  });

  it("returns nothing for a run that was never verified", async () => {
    const run = await seedRun();

    expect(await findVerification(run.id)).toBeNull();
  });
});
