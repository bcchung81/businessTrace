import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { clearSourceDecision, listSourceDecisions, saveSourceDecision } from "@/lib/repositories/sourceDecision";

describe("sourceDecision", () => {
  beforeEach(resetDatabase);

  test("keeps one decision per company and source, overwriting on repeat", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    await saveSourceDecision({ companyId: company.id, source: "nps", value: "625870", label: "㈜가 · 서울", userId: 1 });
    await saveSourceDecision({ companyId: company.id, source: "nps", value: "625871", userId: 1 });
    await saveSourceDecision({ companyId: company.id, source: "dart", value: "none", userId: 1 });
    const rows = await listSourceDecisions(company.id);
    expect(rows.map((r) => [r.source, r.value, r.label])).toEqual([
      ["dart", "none", null],
      ["nps", "625871", null],
    ]);
    await clearSourceDecision(company.id, "dart");
    expect((await listSourceDecisions(company.id)).map((r) => r.source)).toEqual(["nps"]);
  });
});
