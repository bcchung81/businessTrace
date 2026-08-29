import { writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ quiet: true });

const HOST = "https://sgisapi.mods.go.kr/OpenAPI3";
const OUTPUT = "src/lib/geo/korea-regions.json";
const RETRIES = 4;

type Feature = { properties: { adm_cd?: string; adm_nm?: string } };

async function accessToken() {
  const key = process.env.SGIS_CONSUMER_KEY;
  const secret = process.env.SGIS_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("SGIS_CONSUMER_KEY / SGIS_CONSUMER_SECRET 를 .env 에 넣으세요.");

  const url = `${HOST}/auth/authentication.json?consumer_key=${key}&consumer_secret=${secret}`;
  const body = (await (await fetch(url)).json()) as { errCd?: number; errMsg?: string; result?: { accessToken?: string } };
  if (!body.result?.accessToken) throw new Error(`SGIS 인증 실패: ${body.errCd} ${body.errMsg}`);

  return body.result.accessToken;
}

/** 경계 응답은 수 MB 라 간헐적으로 끊긴다. 한 번 실패했다고 앞의 시도를 다시 받게 두지 않는다. */
async function boundary(token: string, year: string, admCode: string | null, attempt = 1): Promise<Feature[]> {
  const params = new URLSearchParams({ accessToken: token, year, low_search: "1" });
  if (admCode) params.set("adm_cd", admCode);

  try {
    const response = await fetch(`${HOST}/boundary/hadmarea.geojson?${params}`);
    const body = (await response.json()) as { features?: Feature[]; errCd?: number; errMsg?: string };
    if (!body.features) throw new Error(`조회 실패(${admCode ?? "전국"}): ${body.errCd} ${body.errMsg}`);
    return body.features;
  } catch (error) {
    if (attempt >= RETRIES) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    return boundary(token, year, admCode, attempt + 1);
  }
}

function trim(name: string, sido: string) {
  return name.startsWith(`${sido} `) ? name.slice(sido.length + 1) : name;
}

/**
 * SGIS 에서 시도·시군구 이름표를 받아 적재한다.
 * 도형이 아니라 이름만 쓴다 — 원천 주소의 표기(전북특별자치도·전남광주통합특별시)를 어디에 앉힐지 판정하는 권위가 필요할 뿐이다.
 * 사용: npx tsx scripts/fetch-regions.ts [연도]
 */
async function main() {
  const year = process.argv[2] ?? "2023";
  const token = await accessToken();

  const provinces = await boundary(token, year, null);
  const sido = provinces.map((feature) => feature.properties.adm_nm ?? "");
  const sigungu: Array<{ sido: string; name: string }> = [];

  for (const [index, province] of provinces.entries()) {
    const districts = await boundary(token, year, province.properties.adm_cd ?? null);
    for (const feature of districts) {
      sigungu.push({ sido: sido[index], name: trim(feature.properties.adm_nm ?? "", sido[index]) });
    }
    console.log(`  ${sido[index]} — 시군구 ${districts.length}`);
  }

  writeFileSync(OUTPUT, `${JSON.stringify({ source: `SGIS 통계지리정보서비스 ${year}`, sido, sigungu }, null, 1)}\n`);
  console.log(`${OUTPUT} — 시도 ${sido.length} · 시군구 ${sigungu.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
