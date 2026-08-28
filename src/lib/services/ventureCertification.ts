import { prisma } from "@/lib/db";

const VENTURE_LIST_URL =
  "https://api.odcloud.kr/api/15084581/v1/uddi:47b202c9-f0bb-43b4-949c-ebe9ef56ef02";
const PAGE_SIZE = 1000;
const MAX_PAGES = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Certification = {
  certified: boolean;
  expired: boolean;
  companyName?: string;
  type?: string;
  validFrom?: string;
  validUntil?: string;
  industry?: string;
  daysRemaining?: number;
};

type VentureRow = Record<string, string>;

/**
 * 상호에서 법인 접두사와 공백을 걷어내 매칭용 이름을 만든다.
 * 명단은 "주식회사 크립토랩" 처럼 저장돼 있어 그대로는 기업명과 매칭되지 않는다.
 */
export function normaliseCompanyName(value: string) {
  return (value ?? "").replace(/\s|\(주\)|주식회사|㈜/g, "");
}

/**
 * 벤처확인 명단 전체를 받아 스냅샷으로 교체한다.
 * 재무제표가 없는 기업도 대부분 포함돼 유일한 전수 신호 역할을 한다.
 */
export async function refreshVentureList(deps: { fetchImpl?: typeof fetch } = {}) {
  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) throw new Error("NTS_SERVICE_KEY 가 설정되지 않았습니다.");

  const fetchImpl = deps.fetchImpl ?? fetch;
  const collected: VentureRow[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(VENTURE_LIST_URL);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(PAGE_SIZE));

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`벤처기업명단 ${response.status}`);

    const body = (await response.json()) as { data?: VentureRow[] };
    const rows = body.data ?? [];
    collected.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  const fetchedAt = new Date();
  await prisma.$transaction([
    prisma.ventureCertification.deleteMany(),
    prisma.ventureCertification.createMany({
      data: collected.map((row) => ({
        companyName: row["업체명"] ?? "",
        normalisedName: normaliseCompanyName(row["업체명"] ?? ""),
        type: row["벤처확인유형"] ?? "",
        validFrom: row["벤처유효시작일"] ?? "",
        validUntil: row["벤처유효종료일"] ?? "",
        industry: row["업종명(11차)"] ?? null,
        authority: row["벤처확인기관"] ?? null,
        fetchedAt,
      })),
    }),
  ]);

  return collected.length;
}

/**
 * 기업명으로 벤처확인 이력을 찾고 기준일 기준 유효 여부를 판정한다.
 * 3년 주기 재확인이라 만료·미갱신은 요건 미달을 시사하는 시계열 신호다.
 */
export async function findCertification(
  companyName: string,
  at: Date,
): Promise<Certification> {
  const normalised = normaliseCompanyName(companyName);
  if (!normalised) return { certified: false, expired: false };

  const rows = await prisma.ventureCertification.findMany({
    where: { normalisedName: { contains: normalised } },
    orderBy: { validUntil: "desc" },
    take: 5,
  });

  const best = rows.find((row) => row.normalisedName === normalised) ?? rows[0];
  if (!best) return { certified: false, expired: false };

  const until = new Date(`${best.validUntil}T00:00:00Z`);
  const reference = new Date(at.toISOString().slice(0, 10) + "T00:00:00Z");
  const daysRemaining = Math.round((until.getTime() - reference.getTime()) / DAY_MS);
  const expired = daysRemaining < 0;

  return {
    certified: !expired,
    expired,
    companyName: best.companyName,
    type: best.type,
    validFrom: best.validFrom,
    validUntil: best.validUntil,
    industry: best.industry ?? undefined,
    daysRemaining,
  };
}
