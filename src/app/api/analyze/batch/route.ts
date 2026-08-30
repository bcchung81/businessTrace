import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createCollectionRun } from "@/lib/repositories/analysisRun";
import { defaultPipelineDeps } from "@/lib/services/analysisPipeline";
import { readBatch } from "@/lib/services/batchRegistry";
import { runBatch, type BatchTarget } from "@/lib/services/batchRun";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { collectNews } from "@/lib/services/newsCollector";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import { createSseSink } from "@/lib/services/sse";

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
    include: { analysisRuns: { where: { status: "completed", verification: { isNot: null } }, select: { id: true }, take: 1 } },
  });
  const targets: BatchTarget[] = companies.map((company) => ({
    id: company.id,
    name: company.name,
    year: company.year,
    businessNo: company.businessNo,
    verified: company.analysisRuns.length > 0,
  }));
  if (targets.length === 0) return Response.json({ message: "실행할 기업이 없습니다." }, { status: 400 });
  if (parsed.data.stage === "sources") await refreshCorpCodes();

  const userId = Number(session.user.id);
  let sink: ReturnType<typeof createSseSink> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const out = createSseSink(controller);
      sink = out;
      try {
        const events = runBatch(targets, parsed.data, {
          userId,
          pipeline: defaultPipelineDeps(),
          collect: (options) => collectNews(options),
          collectOnly: createCollectionRun,
          refreshSources: (target) => refreshSourcesFor(target.id),
          isOpen: () => out.open,
        });
        for await (const event of events) out.send(event);
      } catch (caught) {
        out.send({ type: "error", message: caught instanceof Error ? caught.message : "배치 실패" });
      } finally {
        out.close();
      }
    },
    cancel() {
      sink?.drop();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
