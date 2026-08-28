import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { getCompanyProfile, getFinancialSummary } from "@/lib/services/dart";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { checkBusinessStatus } from "@/lib/services/nts";
import { getProcurementProfile } from "@/lib/services/narajangteo";
import { lookupCorpOutline } from "@/lib/services/fscCorpOutline";
import { findCertification } from "@/lib/services/ventureCertification";

export async function POST(_request: Request, context: RouteContext<"/api/companies/[id]/dart">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const company = await prisma.company.findUnique({ where: { id: Number(id) } });
  if (!company) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });

  await refreshCorpCodes();

  const profile = await getCompanyProfile(company.name);
  const outline = profile.businessNo ? null : await lookupCorpOutline(company.name);
  const businessNo = profile.businessNo ?? outline?.businessNo ?? null;

  if (!profile.found && !businessNo) {
    return Response.json({
      matched: false,
      reason: profile.reason,
      candidates: profile.candidates,
      certification: await findCertification(company.name, new Date()),
    });
  }

  const updated = await updateCompany(company.id, {
    businessNo,
    industry: company.industry ?? profile.industryCode ?? null,
  });
  const [financial, businessStatus, procurement, certification] = await Promise.all([
    getFinancialSummary(company.name, company.year),
    businessNo ? checkBusinessStatus(businessNo) : Promise.resolve(null),
    businessNo ? getProcurementProfile(businessNo) : Promise.resolve(null),
    findCertification(company.name, new Date()),
  ]);

  return Response.json({
    matched: true,
    businessNoSource: profile.businessNo ? "dart" : outline?.businessNo ? "fsc" : null,
    company: updated.ok ? updated.company : null,
    profile,
    outline,
    financial,
    businessStatus,
    procurement,
    certification,
  });
}
