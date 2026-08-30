import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

export async function POST(_request: Request, context: RouteContext<"/api/companies/[id]/dart">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  await refreshCorpCodes();
  const outcome = await refreshSourcesFor(Number(id));
  if (!outcome) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  const company = await prisma.company.findUnique({ where: { id: Number(id) } });
  return Response.json({
    matched: outcome.businessNo !== null,
    businessNoSource: outcome.businessNoSource,
    company,
    snapshots: outcome.snapshots,
    ...outcome.evidence,
  });
}
