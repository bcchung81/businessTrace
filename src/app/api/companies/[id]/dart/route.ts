import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { collectEvidence } from "@/lib/services/collectEvidence";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { toSnapshots } from "@/lib/services/sourceEvidence";

export async function POST(_request: Request, context: RouteContext<"/api/companies/[id]/dart">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const company = await prisma.company.findUnique({ where: { id: Number(id) } });
  if (!company) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  await refreshCorpCodes();

  const { evidence, businessNo, businessNoSource } = await collectEvidence(company);
  const snapshots = toSnapshots(evidence);
  await saveSourceSnapshots(company.id, snapshots);

  const updated = await updateCompany(company.id, {
    businessNo: businessNo ?? company.businessNo,
    industry: company.industry ?? evidence.profile.industryCode ?? null,
  });

  return Response.json({
    matched: businessNo !== null,
    businessNoSource,
    company: updated.ok ? updated.company : null,
    snapshots,
    ...evidence,
  });
}
