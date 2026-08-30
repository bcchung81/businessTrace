import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { defaultPipelineDeps, runCompanyAnalysis } from "@/lib/services/analysisPipeline";
import { collectForCompany } from "@/lib/services/collectForCompany";
import { NewsRateLimitError } from "@/lib/services/newsCollector";
import { createSseSink } from "@/lib/services/sse";

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
    collected = await collectForCompany(company, {
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

  const userId = Number(session.user.id);
  let sink: ReturnType<typeof createSseSink> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const out = createSseSink(controller);
      sink = out;
      try {
        const outcome = await runCompanyAnalysis(
          { company, userId, news: collected.items },
          {
            ...defaultPipelineDeps(),
            onEvent: (event) => out.send(event),
            isOpen: () => out.open,
          },
        );
        if (outcome.status === "failed") out.send({ type: "error", message: "분석 중 오류가 발생했습니다." });
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
