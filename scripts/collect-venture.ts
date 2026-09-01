import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { ventureSnapshot } from "@/lib/services/sourceEvidence";
import { findCertification, refreshVentureList } from "@/lib/services/ventureCertification";

config({ quiet: true });

/**
 * 중소벤처기업부 벤처확인 명단을 통째로 다시 받고 활성 기업의 표기를 새로 낸다.
 * 벤처확인은 3년 주기 재확인이라 유효기간 자체가 시계열 신호다 — 명단을 고정해 두면 만료를 놓친다.
 */
async function main() {
  const year = Number(process.argv[2]) || null;

  const total = await refreshVentureList();
  console.log(`벤처확인 명단 ${total.toLocaleString()}건 적재`);

  const companies = await prisma.company.findMany({
    where: { isActive: true, ...(year ? { year } : {}) },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });

  const now = new Date();
  let certified = 0;
  let expiring = 0;

  for (const company of companies) {
    const certification = await findCertification(company.name, now);
    const row = ventureSnapshot(certification);
    await saveSourceSnapshots(company.id, [row]);

    if (certification.certified) certified += 1;
    const remaining = certification.daysRemaining;
    if (certification.certified && remaining !== undefined && remaining <= 180) {
      expiring += 1;
      console.log(`[만료임박] ${company.name} — ${row.summary} (D-${remaining})`);
    } else if (certification.expired) {
      console.log(`[만료]     ${company.name} — ${row.summary}`);
    }
  }

  console.log(`활성 기업 ${companies.length}개사 · 유효 ${certified} · 180일 이내 만료 ${expiring}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
