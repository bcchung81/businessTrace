import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ quiet: true });

const KEY = process.env.NTS_SERVICE_KEY ?? "";
const OUT = join(process.cwd(), "data");

type Target = { name: string; businessNo?: string };

const TARGETS: Target[] = [
  { name: "크립토랩" },
  { name: "올림플래닛", businessNo: "1208824298" },
  { name: "넷록스" },
  { name: "페어리" },
  { name: "논스랩" },
  { name: "옥타코" },
];

async function get(url: string, params: Record<string, string>) {
  const target = new URL(url);
  target.searchParams.set("serviceKey", KEY);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  const res = await fetch(target, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function save(name: string, payload: unknown) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(payload, null, 2) + "\n");
  console.log(`  → data/${name}.json`);
}

function unwrap(body: Record<string, unknown>) {
  const response = body.response as { body?: { items?: unknown; totalCount?: number } } | undefined;
  const items = response?.body?.items;
  if (Array.isArray(items)) return { items, total: response?.body?.totalCount ?? items.length };
  const nested = (items as { item?: unknown })?.item;
  const list = Array.isArray(nested) ? nested : nested ? [nested] : [];
  return { items: list, total: response?.body?.totalCount ?? list.length };
}

/**
 * 금융위 기업기본정보에서 법인등록번호·설립일·업종을 모은다.
 * DART 미등록 기업도 잡히는지 확인하는 것이 이 수집의 목적이다.
 */
async function collectCorpOutline() {
  console.log("[금융위 기업기본정보]");
  const rows: Array<Record<string, unknown>> = [];
  for (const target of TARGETS) {
    try {
      const body = await get(
        "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2",
        { corpNm: target.name, numOfRows: "20", pageNo: "1", resultType: "json" },
      );
      const { items } = unwrap(body);
      console.log(`  ${target.name}: ${items.length}건`);
      rows.push({ query: target.name, count: items.length, items });
    } catch (error) {
      console.log(`  ${target.name}: 실패 ${String(error)}`);
      rows.push({ query: target.name, error: String(error) });
    }
  }
  save("fsc-corp-outline", rows);
  return rows;
}

/**
 * 나라장터 낙찰정보를 기간 단위로 훑어 대상 기업의 낙찰 실적을 추린다.
 * 업체 단위 조회 파라미터가 없어 기간 스캔 후 사업자번호·상호로 거른다.
 */
async function collectProcurementWins(months: number) {
  console.log(`[나라장터 낙찰정보] 최근 ${months}개월 스캔`);
  const services = [
    ["물품", "getScsbidListSttusThngPPSSrch"],
    ["용역", "getScsbidListSttusServcPPSSrch"],
  ] as const;

  const matched: Array<Record<string, unknown>> = [];
  let scanned = 0;

  for (let m = 0; m < months; m += 1) {
    const end = new Date();
    end.setMonth(end.getMonth() - m);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}0000`;

    for (const [label, op] of services) {
      for (let page = 1; page <= 10; page += 1) {
        try {
          const body = await get(`https://apis.data.go.kr/1230000/as/ScsbidInfoService/${op}`, {
            numOfRows: "999",
            pageNo: String(page),
            type: "json",
            inqryDiv: "1",
            inqryBgnDt: fmt(start),
            inqryEndDt: fmt(end),
          });
          const { items, total } = unwrap(body);
          scanned += items.length;
          for (const raw of items as Array<Record<string, string>>) {
            const hit = TARGETS.find(
              (t) =>
                (t.businessNo && raw.bidwinnrBizno === t.businessNo) ||
                (raw.bidwinnrNm ?? "").replace(/\s|\(주\)|주식회사/g, "").includes(t.name),
            );
            if (hit) matched.push({ company: hit.name, category: label, ...raw });
          }
          if (items.length < 999 || page * 999 >= total) break;
        } catch {
          break;
        }
      }
    }
    process.stdout.write(`  ${m + 1}/${months}개월 스캔 ${scanned}건, 매칭 ${matched.length}건\r`);
  }

  console.log(`\n  총 스캔 ${scanned}건 · 대상 기업 낙찰 ${matched.length}건`);
  save("procurement-wins", { scanned, matched });
  return matched;
}

/**
 * 벤처기업 확인 명단 전체를 받아 대상 기업만 남긴다.
 * 벤처확인은 투자·기술평가 요건을 통과했다는 신호라 재무 결측 기업의 대리지표가 된다.
 */
async function collectVentureList() {
  console.log("[벤처기업명단]");
  const url = "https://api.odcloud.kr/api/15084581/v1/uddi:47b202c9-f0bb-43b4-949c-ebe9ef56ef02";
  const matched: Array<Record<string, unknown>> = [];
  let total = 0;

  for (let page = 1; page <= 60; page += 1) {
    const target = new URL(url);
    target.searchParams.set("serviceKey", KEY);
    target.searchParams.set("page", String(page));
    target.searchParams.set("perPage", "1000");
    const res = await fetch(target, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) break;
    const body = (await res.json()) as { data?: Array<Record<string, string>>; totalCount?: number };
    const rows = body.data ?? [];
    total = body.totalCount ?? total;
    for (const row of rows) {
      const name = (row["업체명"] ?? "").replace(/\s|\(주\)|주식회사/g, "");
      const hit = TARGETS.find((t) => name.includes(t.name));
      if (hit) matched.push({ company: hit.name, ...row });
    }
    process.stdout.write(`  ${page * 1000}/${total} 스캔, 매칭 ${matched.length}건\r`);
    if (rows.length < 1000) break;
  }

  console.log(`\n  전체 ${total}건 · 대상 기업 ${matched.length}건`);
  save("venture-certified", { total, matched });
  return matched;
}

async function main() {
  if (!KEY) throw new Error("NTS_SERVICE_KEY 가 없습니다.");
  const months = Number(process.argv[2] ?? "6");

  await collectCorpOutline();
  await collectVentureList();
  await collectProcurementWins(months);

  console.log("\n완료. data/ 폴더 확인");
}

main();
