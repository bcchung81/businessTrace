import { prisma } from "@/lib/db";

export async function resetDatabase() {
  await prisma.verificationResult.deleteMany();
  await prisma.analysisRun.deleteMany();
  await prisma.archive.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dartCorpCode.deleteMany();
}
