import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createCollectionRun } from "@/lib/repositories/analysisRun";
import { defaultPipelineDeps } from "@/lib/services/analysisPipeline";
import { abortRequested, readBatch } from "@/lib/services/batchRegistry";
import { launchBatch } from "@/lib/services/batchSession";
import { runBatch, type BatchTarget } from "@/lib/services/batchRun";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { logEvent } from "@/lib/services/logger";
import { collectForCompany } from "@/lib/services/collectForCompany";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

const bodySchema = z.object({
  companyIds: z.array(z.number().int()).min(1),
  stage: z.enum(["full", "news", "sources"]).default("full"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  force: z.boolean().default(false),
  naver: z.boolean().default(true),
  google: z.boolean().default(true),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "잘못된 요청입니다." }, { status: 400 });
  const running = readBatch();
  if (running) return Response.json({ message: `이미 실행 중입니다 · ${running.total}개사` }, { status: 409 });

  const companies = await prisma.company.findMany({
    where: { id: { in: parsed.data.companyIds }, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
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
  if (targets.length === 0) return Response.json({ message: "실행할 기업이 없습니다." }, { status: 400 });

  const userId = Number(session.user.id);
  const events = runBatch(targets, parsed.data, {
    userId,
    pipeline: defaultPipelineDeps(),
    collect: ({ query, aliases, ...options }) => collectForCompany({ name: query, aliases }, options),
    collectOnly: createCollectionRun,
    refreshSources: (target) => refreshSourcesFor(target.id),
    // 20MB zip 을 요청 안에서 받으면 202 를 돌려주기 전에 프록시 타임아웃과 겹친다 — 배치 첫 스텝으로 민다.
    prepare: parsed.data.stage === "sources" ? refreshCorpCodes : undefined,
    isOpen: () => !abortRequested(),
  });
  const first = await events.next();
  if (first.done) {
    logEvent("error", "route.batch_start_failed", { userId, companies: targets.length, stage: parsed.data.stage });
    return Response.json({ message: "배치를 시작하지 못했습니다." }, { status: 500 });
  }
  void launchBatch(prepend(first.value, events));
  return Response.json({ batch: readBatch() }, { status: 202 });
}

/**
 * 제너레이터의 첫 이벤트를 먼저 뽑아 startBatch 가 요청 안에서 실행되게 한다 — 그래야 202 응답의 batch 가 null 이 아니다.
 */
async function* prepend(first: unknown, rest: AsyncGenerator<unknown>): AsyncGenerator<unknown> {
  yield first;
  for await (const event of rest) yield event;
}
