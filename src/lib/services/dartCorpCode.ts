import { unzipSync } from "fflate";
import { prisma } from "@/lib/db";

const CORP_CODE_URL = "https://opendart.fss.or.kr/api/corpCode.xml";

export const CORP_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export type CorpCandidate = {
  corpCode: string;
  corpName: string;
  stockCode: string | null;
};

type RefreshDeps = {
  fetchImpl?: typeof fetch;
  unzip?: (archive: Buffer) => Promise<string>;
};

async function defaultUnzip(archive: Buffer) {
  const files = unzipSync(new Uint8Array(archive));
  const xmlName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".xml"));
  if (!xmlName) throw new Error("DART corpCode 아카이브에 XML 이 없습니다.");
  return new TextDecoder("utf-8").decode(files[xmlName]);
}

function requireApiKey() {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 가 설정되지 않았습니다.");
  return key;
}

function parseCorpCodeXml(xml: string) {
  const entries: CorpCandidate[] = [];
  const blocks = xml.match(/<list>[\s\S]*?<\/list>/g) ?? [];

  for (const block of blocks) {
    const corpCode = /<corp_code>([^<]*)<\/corp_code>/.exec(block)?.[1]?.trim();
    const corpName = /<corp_name>([^<]*)<\/corp_name>/.exec(block)?.[1]?.trim();
    const stockCode = /<stock_code>([^<]*)<\/stock_code>/.exec(block)?.[1]?.trim();
    const modifyDate = /<modify_date>([^<]*)<\/modify_date>/.exec(block)?.[1]?.trim() ?? "";

    if (!corpCode || !corpName) continue;
    entries.push({ corpCode, corpName, stockCode: stockCode ? stockCode : null });
    Object.assign(entries.at(-1) as CorpCandidate, { modifyDate });
  }

  return entries as Array<CorpCandidate & { modifyDate: string }>;
}

async function isCacheFresh() {
  const newest = await prisma.dartCorpCode.findFirst({ orderBy: { fetchedAt: "desc" } });
  if (!newest) return false;
  return Date.now() - newest.fetchedAt.getTime() < CORP_CODE_TTL_MS;
}

/**
 * DART 고유번호 목록을 내려받아 캐시한다. 신선하면 건너뛴다.
 * 원본이 약 20MB zip 이라 매 조회마다 받으면 안 된다.
 */
export async function refreshCorpCodes(deps: RefreshDeps = {}) {
  const key = requireApiKey();
  if (await isCacheFresh()) return prisma.dartCorpCode.count();

  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = new URL(CORP_CODE_URL);
  url.searchParams.set("crtfc_key", key);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`DART corpCode ${response.status}`);

  const archive = Buffer.from(await response.arrayBuffer());
  const unzip = deps.unzip ?? defaultUnzip;
  const entries = parseCorpCodeXml(await unzip(archive));

  const fetchedAt = new Date();
  await prisma.$transaction([
    prisma.dartCorpCode.deleteMany(),
    prisma.dartCorpCode.createMany({
      data: entries.map((entry) => ({
        corpCode: entry.corpCode,
        corpName: entry.corpName,
        stockCode: entry.stockCode,
        modifyDate: entry.modifyDate,
        fetchedAt,
      })),
    }),
  ]);

  return entries.length;
}

/**
 * 기업명으로 DART 고유번호 후보를 찾는다. 정확히 일치하는 이름이 먼저 온다.
 * 동명·유사 상호가 흔해 단일 결과로 단정하지 않고 관리자가 고르게 한다.
 */
export async function findCorpCandidates(companyName: string): Promise<CorpCandidate[]> {
  const name = companyName.trim();
  if (!name) return [];

  const rows = await prisma.dartCorpCode.findMany({
    where: { corpName: { startsWith: name } },
    orderBy: { corpName: "asc" },
    take: 20,
  });

  return rows
    .map((row) => ({ corpCode: row.corpCode, corpName: row.corpName, stockCode: row.stockCode }))
    .sort((a, b) => Number(b.corpName === name) - Number(a.corpName === name));
}
