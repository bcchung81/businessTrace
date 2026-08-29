import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { createCollectionRun } from "@/lib/repositories/analysisRun";
import { NewsRateLimitError, collectNews } from "@/lib/services/newsCollector";

config({ quiet: true });

/**
 * 활성 기업의 뉴스를 수집만 해서 적재한다. LLM 을 호출하지 않는다.
 * 사용: npx tsx scripts/collect-news.ts [연도] [기업당 기사수] [기업명 필터]
 */
async function main() {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const limit = Number(process.argv[3]) || 20;
  const only = (process.argv[4] ?? "").split(",").map((name) => name.trim()).filter(Boolean);

  const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  if (!user) throw new Error("관리자 계정이 없습니다. scripts/create-admin.ts 를 먼저 실행하세요.");

  const companies = (
    await prisma.company.findMany({
      where: { year, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    })
  ).filter((company) => only.length === 0 || only.some((name) => company.name.includes(name)));

  let collected = 0;
  for (const company of companies) {
    try {
      const result = await collectNews({ query: company.name, limit });
      await createCollectionRun({ companyId: company.id, userId: user.id, news: result.items });
      collected += result.items.length;
      console.log(
        `[OK]   ${company.name.padEnd(16)} ${String(result.items.length).padStart(3)}건 ` +
          `(주제 ${result.primaryCount} · 중복 ${result.duplicatesRemoved} 제거)` +
          (result.errors.length ? ` · ${result.errors.join(" / ")}` : ""),
      );
    } catch (caught) {
      const reason = caught instanceof NewsRateLimitError ? "레이트리밋" : String(caught);
      console.log(`[SKIP] ${company.name.padEnd(16)} ${reason}`);
    }
  }

  console.log(`\n${companies.length}개사 · 기사 ${collected}건 적재 (LLM 호출 0회)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
