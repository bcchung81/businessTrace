import { prisma } from "@/lib/db";

export async function resetDatabase() {
  await prisma.event.deleteMany();
  await prisma.selectionRecord.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.verificationResult.deleteMany();
  await prisma.analysisRun.deleteMany();
  await prisma.archive.deleteMany();
  await prisma.companyGeocode.deleteMany();
  await prisma.pensionSnapshot.deleteMany();
  await prisma.sourceSnapshot.deleteMany();
  await prisma.sourceDecision.deleteMany();
  await prisma.procurementAward.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dartCorpCode.deleteMany();
  await prisma.ventureCertification.deleteMany();
}
