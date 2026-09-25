import { config } from "dotenv";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { enableWal, prisma } from "@/lib/db";
import { createCollectionRun } from "@/lib/repositories/analysisRun";
import { defaultPipelineDeps } from "@/lib/services/analysisPipeline";
import { runBatch, type BatchTarget } from "@/lib/services/batchRun";
import { collectForCompany } from "@/lib/services/collectForCompany";
import { holdJobLock } from "@/lib/services/jobLease";
import { logEvent } from "@/lib/services/logger";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import { collectCommands, lockNameFor, newsBatchOptions, parseJob, resolveNewsStage, type NewsStage, type ScheduledJob } from "@/lib/services/scheduledJobs";

config({ quiet: true });

const TSX_CLI = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

/**
 * 활성 기업 전체를 배치 화면과 같은 경로(runBatch)로 돌리고 상태별 개수를 로그로 남긴다.
 */
async function runNews(stage: Exclude<NewsStage, "off">) {
  const user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  if (!user) throw new Error("관리자 계정이 없습니다 — 실행 기록의 주체가 필요합니다.");

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: [{ year: "desc" }, { displayOrder: "asc" }, { id: "asc" }],
    include: { analysisRuns: { where: { status: "completed", verification: { is: { status: "verified" } } }, select: { id: true }, take: 1 } },
  });
  const targets: BatchTarget[] = companies.map((company) => ({
    id: company.id,
    name: company.name,
    year: company.year,
    businessNo: company.businessNo,
    verified: company.analysisRuns.length > 0,
    aliases: company.aliases,
  }));

  const tally: Record<string, number> = {};
  let aborted = false;
  for await (const event of runBatch(targets, newsBatchOptions(stage), {
    userId: user.id,
    pipeline: defaultPipelineDeps(),
    collect: ({ query, aliases, ...options }) => collectForCompany({ name: query, aliases }, options),
    collectOnly: createCollectionRun,
    refreshSources: (target) => refreshSourcesFor(target.id),
  })) {
    if (event.type === "company_done") tally[event.status] = (tally[event.status] ?? 0) + 1;
    if (event.type === "batch_done") aborted = event.aborted;
  }
  logEvent(aborted ? "warn" : "info", "schedule.news_done", { stage, total: targets.length, aborted, ...tally });
}

/**
 * 수집 스크립트를 자식 프로세스로 돌린다. spawnSync 로 막으면 잠금 갱신 타이머가 멈춰 40분짜리 조달 스캔 중에 임대가 끝난다.
 */
function runScript(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, script, ...args], { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} ${args.join(" ")} 가 ${code} 로 끝났습니다.`))));
  });
}

async function runCollect(job: Exclude<ScheduledJob, "news">) {
  const years = (await prisma.company.findMany({ where: { isActive: true }, distinct: ["year"], select: { year: true }, orderBy: { year: "asc" } })).map((row) => row.year);
  for (const [script, ...args] of collectCommands(job, years)) await runScript(script, args);
}

/**
 * systemd timer 가 부르는 정기 작업 진입점. 같은 작업이 이미 돌고 있으면(웹 배치 포함) 조용히 건너뛴다.
 * 사용: npx tsx scripts/scheduled.ts news|pension|procurement|venture
 */
async function main() {
  const job = parseJob(process.argv[2]);
  const stage = job === "news" ? resolveNewsStage() : null;
  if (stage === "off") {
    logEvent("info", "schedule.skipped", { job, reason: "SCHEDULE_NEWS_STAGE=off" });
    return;
  }

  await enableWal();
  const lock = lockNameFor(job);
  const release = await holdJobLock(lock, `scheduled:${process.pid}`);
  if (!release) {
    logEvent("warn", "schedule.locked", { job, lock });
    return;
  }

  const started = performance.now();
  logEvent("info", "schedule.start", { job, ...(stage ? { stage } : {}) });
  try {
    if (job === "news") await runNews(stage as Exclude<NewsStage, "off">);
    else await runCollect(job);
    logEvent("info", "schedule.done", { job, ms: Math.round(performance.now() - started) });
  } finally {
    await release();
  }
}

main()
  .catch((error) => {
    logEvent("error", "schedule.failed", { job: process.argv[2], error });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
