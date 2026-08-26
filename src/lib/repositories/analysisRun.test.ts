import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

async function seedCompanyAndUser() {
  const company = await prisma.company.create({ data: { name: "크립토랩", year: 2024 } });
  const user = await prisma.user.create({
    data: { email: `run-${company.id}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return { company, user };
}

describe("AnalysisRun schema", () => {
  beforeEach(resetDatabase);

  it("stamps the Anthropic formula version so year-over-year scores stay comparable", async () => {
    const { company, user } = await seedCompanyAndUser();

    const run = await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
    });

    expect(run.formulaVersion).toBe("v2-anthropic");
    expect(run.status).toBe("running");
  });

  it("deletes the verification result when its analysis run is deleted", async () => {
    const { company, user } = await seedCompanyAndUser();
    const run = await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
    });
    await prisma.verificationResult.create({
      data: {
        analysisRunId: run.id,
        status: "needs_review",
        unsupportedClaims: "[]",
        counterEvidence: "[]",
        detailJson: "{}",
      },
    });

    await prisma.analysisRun.delete({ where: { id: run.id } });

    expect(await prisma.verificationResult.count()).toBe(0);
  });

  it("keeps verification scores nullable so a failed judge cannot look like a zero score", async () => {
    const { company, user } = await seedCompanyAndUser();
    const run = await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
    });

    const result = await prisma.verificationResult.create({
      data: {
        analysisRunId: run.id,
        status: "needs_review",
        unsupportedClaims: "[]",
        counterEvidence: "[]",
        detailJson: '{"error":"timeout"}',
      },
    });

    expect(result.faithfulness).toBeNull();
    expect(result.status).toBe("needs_review");
  });

  it("allows only one verification result per analysis run", async () => {
    const { company, user } = await seedCompanyAndUser();
    const run = await prisma.analysisRun.create({
      data: { companyId: company.id, userId: user.id, model: "claude-sonnet-5", newsJson: "[]" },
    });
    const payload = {
      analysisRunId: run.id,
      status: "verified",
      unsupportedClaims: "[]",
      counterEvidence: "[]",
      detailJson: "{}",
    };
    await prisma.verificationResult.create({ data: payload });

    await expect(prisma.verificationResult.create({ data: payload })).rejects.toThrow();
  });
});
