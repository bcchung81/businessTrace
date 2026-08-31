import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import { parseId } from "@/lib/services/routeParams";

export async function POST(_request: Request, context: RouteContext<"/api/companies/[id]/dart">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const companyId = parseId((await context.params).id);
  if (companyId === null) return Response.json({ message: "잘못된 id 입니다." }, { status: 400 });
  await refreshCorpCodes();
  const outcome = await refreshSourcesFor(companyId);
  if (!outcome) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  return Response.json({
    matched: outcome.businessNo !== null,
    businessNoSource: outcome.businessNoSource,
    company,
    snapshots: outcome.snapshots,
    ...outcome.evidence,
  });
}
