import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { completeRun, createRun, failRun } from "@/lib/repositories/analysisRun";
import { analyzeCompany } from "@/lib/services/analyzer";
import { defaultLlmClient, resolveModel } from "@/lib/services/llm";
import { NewsRateLimitError, collectNews } from "@/lib/services/newsCollector";
import { saveVerification } from "@/lib/repositories/verificationResult";
import { createSseSink } from "@/lib/services/sse";
import { verifyAnalysis } from "@/lib/services/verification";

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

  let sink: ReturnType<typeof createSseSink> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const out = createSseSink(controller);
      sink = out;
      const send = (event: unknown) => out.send(event);

      send({ type: "collected", runId: run.id, ...collected, items: undefined });

      try {
        for await (const event of analyzeCompany(company.name, collected.items, {
          llm: defaultLlmClient(),
          model,
        })) {
          if (!out.open) break;
          if (event.type === "complete") {
            await completeRun(run.id, event.result);
            send({ ...event, runId: run.id });

            send({ type: "verifying", runId: run.id });
            try {
              const verification = await verifyAnalysis(event.result, { llm: defaultLlmClient() });
              await saveVerification(run.id, verification);
              send({ type: "verified", runId: run.id, verification });
            } catch (caught) {
              const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
              send({ type: "verification_failed", runId: run.id, message: reason });
            }
          } else {
            send(event);
          }
        }

        if (!out.open) await failRun(run.id, "클라이언트가 연결을 끊었습니다.");
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
        await failRun(run.id, message);
        send({ type: "error", message: "분석 중 오류가 발생했습니다." });
      } finally {
        out.close();
      }
    },
    /** 화면을 떠나면 분석을 멈춘다. 놔두면 아무도 안 보는 LLM 호출이 끝까지 돌고 결과가 버퍼에 쌓인다. */
    cancel() {
      sink?.drop();
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
