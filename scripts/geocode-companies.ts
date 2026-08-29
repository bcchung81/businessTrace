import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { listCompanyAddresses } from "@/lib/repositories/companyLocations";
import { saveGeocode } from "@/lib/repositories/companyGeocode";
import { addressPrecision, geocodeAddress } from "@/lib/services/naverGeocode";

config({ quiet: true });

const PAUSE_MS = 120;

/**
 * 원천 주소를 네이버 Geocoding 으로 좌표로 옮겨 적재한다.
 * 사용: npx tsx scripts/geocode-companies.ts [연도]
 */
async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const companies = await listCompanyAddresses(year);

  let placed = 0;
  const missed: string[] = [];

  for (const company of companies) {
    const best = [...company.addresses].sort(
      (left, right) =>
        Number(addressPrecision(right.address) === "building") -
        Number(addressPrecision(left.address) === "building"),
    )[0];

    if (!best) {
      missed.push(`${company.name} — 주소 없음`);
      continue;
    }

    try {
      const point = await geocodeAddress(best.address);
      if (!point) {
        missed.push(`${company.name} — 매칭 없음 (${best.address})`);
        continue;
      }

      await saveGeocode(company.companyId, {
        address: best.address,
        source: best.source,
        precision: point.precision,
        roadAddress: point.roadAddress,
        latitude: point.latitude,
        longitude: point.longitude,
      });
      placed += 1;
      console.log(`  ${company.name} ${point.precision} ${point.latitude},${point.longitude}`);
    } catch (error) {
      missed.push(`${company.name} — ${error instanceof Error ? error.message : error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  console.log(`\n${year}년 ${placed}/${companies.length}개사 좌표 적재`);
  for (const entry of missed) console.log(`  [MISS] ${entry}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
