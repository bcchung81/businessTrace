import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { completeRun, createRun, failRun } from "@/lib/repositories/analysisRun";
import { analyzeCompany } from "@/lib/services/analyzer";
import { defaultLlmClient, resolveModel } from "@/lib/services/llm";
import { NewsRateLimitError, collectNews } from "@/lib/services/newsCollector";

const bodySchema = z.object({
  companyId: z.number().int(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ message: "잘못된 요청입니다." }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
  if (!company) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  let collected;
  try {
    collected = await collectNews({
      query: company.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      limit: parsed.data.limit,
    });
  } catch (caught) {
    if (caught instanceof NewsRateLimitError) {
      return Response.json({ message: caught.message }, { status: 429 });
    }
    throw caught;
  }

  const model = resolveModel();
  const run = await createRun({
    companyId: company.id,
    userId: Number(session.user.id),
    model,
    news: collected.items,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      send({ type: "collected", runId: run.id, ...collected, items: undefined });

      try {
        for await (const event of analyzeCompany(company.name, collected.items, {
          llm: defaultLlmClient(),
          model,
        })) {
          if (event.type === "complete") {
            await completeRun(run.id, event.result);
            send({ ...event, runId: run.id });
          } else {
            send(event);
          }
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
        await failRun(run.id, message);
        send({ type: "error", message: "분석 중 오류가 발생했습니다." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
