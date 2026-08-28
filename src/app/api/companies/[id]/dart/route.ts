import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { getCompanyProfile, getFinancialSummary } from "@/lib/services/dart";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { checkBusinessStatus } from "@/lib/services/nts";
import { getProcurementProfile } from "@/lib/services/narajangteo";

export async function POST(_request: Request, context: RouteContext<"/api/companies/[id]/dart">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const company = await prisma.company.findUnique({ where: { id: Number(id) } });
  if (!company) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  await refreshCorpCodes();

  const profile = await getCompanyProfile(company.name);
  if (!profile.found) {
    return Response.json({ matched: false, reason: profile.reason, candidates: profile.candidates });
  }

  const updated = await updateCompany(company.id, {
    businessNo: profile.businessNo ?? null,
    industry: company.industry ?? profile.industryCode ?? null,
  });
  const [financial, businessStatus, procurement] = await Promise.all([
    getFinancialSummary(company.name, company.year),
    profile.businessNo
      ? checkBusinessStatus(profile.businessNo)
      : Promise.resolve(null),
    profile.businessNo
      ? getProcurementProfile(profile.businessNo)
      : Promise.resolve(null),
  ]);

  return Response.json({
    matched: true,
    company: updated.ok ? updated.company : null,
    profile,
    financial,
    businessStatus,
    procurement,
  });
}
