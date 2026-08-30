import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { defaultPipelineDeps, runCompanyAnalysis } from "@/lib/services/analysisPipeline";
import { NewsRateLimitError, collectNews } from "@/lib/services/newsCollector";

config({ quiet: true });

/**
 * 판정이 없는 활성 기업을 차례로 수집 → 분석 → 검증한다. 이미 검증된 기업은 --force 없이는 건너뛴다.
 * 사용: npx tsx scripts/analyze-all.ts [연도] [기업당 기사수] [기업명 필터] [--force] [--since=YYYY-MM-DD]  (기본 최근 90일)
 */
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const year = Number(positional[0]) || new Date().getFullYear();
  const limit = Number(positional[1]) || 20;
  const only = (positional[2] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const sinceArg = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length);
  const since = sinceArg ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  if (!user) throw new Error("관리자 계정이 없습니다. scripts/create-admin.ts 를 먼저 실행하세요.");

  const companies = (
    await prisma.company.findMany({
      where: { year, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      include: { analysisRuns: { where: { status: "completed", verification: { isNot: null } }, select: { id: true }, take: 1 } },
    })
  ).filter((company) => only.length === 0 || only.some((name) => company.name.includes(name)));

  const deps = defaultPipelineDeps();
  const tally = { verified: 0, needs_review: 0, no_news: 0, verification_failed: 0, failed: 0, aborted: 0, skipped: 0 };
  let tokens = 0;

  for (const company of companies) {
    if (!force && company.analysisRuns.length > 0) {
      tally.skipped += 1;
      console.log(`[SKIP] ${company.name.padEnd(16)} 이미 검증됨`);
      continue;
    }

    let news;
    try {
      news = (await collectNews({ query: company.name, limit, startDate: since })).items;
    } catch (caught) {
      const reason = caught instanceof NewsRateLimitError ? "레이트리밋" : String(caught);
      tally.failed += 1;
      console.log(`[FAIL] ${company.name.padEnd(16)} 수집 실패 · ${reason}`);
      continue;
    }

    const outcome = await runCompanyAnalysis({ company, userId: user.id, news }, deps);
    tally[outcome.status] += 1;
    tokens += outcome.usage.inputTokens + outcome.usage.outputTokens;
    console.log(
      `[${outcome.status.toUpperCase().padEnd(19)}] ${company.name.padEnd(16)} run ${outcome.runId} · 기사 ${news.length}건` +
        (outcome.message ? ` · ${outcome.message}` : ""),
    );
  }

  console.log(
    `\n${companies.length}개사 · 통과 ${tally.verified} · 검토 ${tally.needs_review} · 뉴스없음 ${tally.no_news} · ` +
      `검증실패 ${tally.verification_failed} · 실패 ${tally.failed} · 건너뜀 ${tally.skipped} · 토큰 ${tokens.toLocaleString()}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
