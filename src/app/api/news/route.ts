import { z } from "zod";
import { auth } from "@/auth";
import { NewsRateLimitError, collectNews } from "@/lib/services/newsCollector";

const querySchema = z.object({
  query: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return Response.json({ message: "query 파라미터가 필요합니다." }, { status: 400 });

  try {
    return Response.json(await collectNews(parsed.data));
  } catch (caught) {
    if (caught instanceof NewsRateLimitError) {
      return Response.json({ message: caught.message }, { status: 429 });
    }
    throw caught;
  }
}
