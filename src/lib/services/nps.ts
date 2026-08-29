const BASE_URL = "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2";
const REQUEST_TIMEOUT_MS = 15000;
export const CONTRIBUTION_RATE = 0.09;
const MAX_MONTHS = 12;
const NO_WITHDRAWAL = "00010101";

export type NpsMonth = {
  ym: string;
  subscribers: number | null;
  noticeAmount: number | null;
  hired: number | null;
  departed: number | null;
};

export type NpsCandidate = {
  companyName: string;
  businessNoPrefix: string;
  address?: string;
};

export type NpsWorkplace = {
  found: boolean;
  companyName?: string;
  businessNoPrefix?: string;
  address?: string;
  industry?: string;
  industryCode?: string;
  registeredAt?: string;
  withdrawnAt?: string;
  isSubscribed?: boolean;
  workplaceCount?: number;
  subscribers: number | null;
  noticeAmount: number | null;
  averageBaseIncome: number | null;
  annualPayroll: number | null;
  months: NpsMonth[];
  growth: { from: number; to: number; delta: number; ratio: number } | null;
  candidates?: NpsCandidate[];
  failed?: boolean;
  reason?: string;
};

type Row = Record<string, string | number>;
type Deps = { fetchImpl?: typeof fetch };
type Hints = { businessNo?: string; region?: string };

const EMPTY = {
  subscribers: null,
  noticeAmount: null,
  averageBaseIncome: null,
  annualPayroll: null,
  months: [] as NpsMonth[],
  growth: null,
};

/**
 * 사업자번호에서 국민연금이 공개하는 앞 6자리만 남긴다.
 * 명단은 `625870****` 로 마스킹돼 있어 10자리 대조가 불가능하다. 6자리가 매칭의 최대 해상도다.
 */
export function businessNoPrefix(raw: string) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? digits.slice(0, 6) : null;
}

function text(row: Row, key: string) {
  const value = row[key];
  return value === undefined || value === null ? "" : String(value);
}

function positive(value: string) {
  const number = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normaliseName(value: string) {
  return value.replace(/\s|\(주\)|주식회사|㈜/g, "");
}

function readRows(body: unknown): Row[] {
  const items = (body as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  const nested = Array.isArray(items) ? items : (items as { item?: unknown })?.item;
  if (Array.isArray(nested)) return nested as Row[];
  return nested ? [nested as Row] : [];
}

function score(row: Row, companyName: string, hints: Hints) {
  const wanted = normaliseName(companyName);
  const name = normaliseName(text(row, "wkplNm"));
  const wantedPrefix = hints.businessNo ? businessNoPrefix(hints.businessNo) : null;
  const regionTokens = (hints.region ?? "").split(/\s+/).filter(Boolean);
  const address = text(row, "wkplRoadNmDtlAddr");

  let points = 0;
  if (wantedPrefix && businessNoPrefix(text(row, "bzowrRgstNo")) === wantedPrefix) points += 8;
  if (name === wanted) points += 4;
  else if (name.includes(wanted)) points += 2;
  if (regionTokens.length > 0 && regionTokens.every((token) => address.includes(token))) points += 3;
  if (text(row, "wkplJnngStcd") === "1") points += 1;
  return points;
}

function groupKey(row: Row) {
  return businessNoPrefix(text(row, "bzowrRgstNo")) ?? `${text(row, "wkplNm")}|${text(row, "wkplRoadNmDtlAddr")}`;
}

/**
 * 법인 후보군을 사업자번호 앞 6자리로 묶고 하나를 고른다.
 * 번호를 알고 있으면 그 번호로 먼저 거른다 - 이름 점수로 고르면 동명 타사를 집을 수 있다.
 */
function pickCompany(rows: Row[], companyName: string, hints: Hints) {
  const wantedPrefix = hints.businessNo ? businessNoPrefix(hints.businessNo) : null;
  if (wantedPrefix) {
    const matched = rows.filter((row) => businessNoPrefix(text(row, "bzowrRgstNo")) === wantedPrefix);
    return { rows: matched, ambiguous: false, numberMismatch: matched.length === 0 };
  }

  const groups = new Map<string, { rows: Row[]; score: number }>();
  for (const row of rows) {
    const key = groupKey(row);
    const group = groups.get(key) ?? { rows: [], score: 0 };
    group.rows.push(row);
    group.score = Math.max(group.score, score(row, companyName, hints));
    groups.set(key, group);
  }

  const ranked = [...groups.values()].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return { rows: [] as Row[], ambiguous: false, numberMismatch: false };
  return {
    rows: best.rows,
    ambiguous: ranked.length > 1 && ranked[1].score === best.score,
    numberMismatch: false,
  };
}

function toCandidates(rows: Row[]): NpsCandidate[] {
  const seen = new Map<string, NpsCandidate>();
  for (const row of rows) {
    seen.set(groupKey(row), {
      companyName: text(row, "wkplNm"),
      businessNoPrefix: businessNoPrefix(text(row, "bzowrRgstNo")) ?? "",
      address: text(row, "wkplRoadNmDtlAddr") || undefined,
    });
  }
  return [...seen.values()];
}

function sum(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

/**
 * 국민연금 가입 사업장에서 고용 규모와 12개월 추이를 낸다.
 * 사업장 단위 데이터라 같은 법인의 여러 사업장을 합산한다 — 합치지 않으면 이전이 인원 급감으로 읽힌다.
 */
export async function lookupWorkplace(
  companyName: string,
  hints: Hints = {},
  deps: Deps = {},
): Promise<NpsWorkplace> {
  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) {
    return { found: false, ...EMPTY, reason: "NTS_SERVICE_KEY 가 설정되지 않았습니다." };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const call = async (operation: string, params: Record<string, string>) => {
    const url = new URL(`${BASE_URL}/${operation}`);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("dataType", "json");
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`국민연금 응답 ${response.status}`);

    const body = (await response.json()) as { response?: { header?: { resultCode?: string; resultMsg?: string } } };
    const header = body.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      throw new Error(`국민연금 응답 ${header.resultCode}: ${header.resultMsg ?? "사유 없음"}`);
    }
    return readRows(body);
  };

  try {
    const search = (name: string) =>
      call("getBassInfoSearchV2", { wkplNm: name, numOfRows: "100", pageNo: "1" });

    let found = await search(companyName);
    const closedUp = companyName.replace(/\s+/g, "");
    if (found.length === 0 && closedUp !== companyName) found = await search(closedUp);

    if (found.length === 0) {
      return { found: false, ...EMPTY, reason: "국민연금 가입 사업장에서 찾지 못했습니다." };
    }

    const { rows, ambiguous, numberMismatch } = pickCompany(found, companyName, hints);
    if (numberMismatch) {
      return {
        found: false,
        ...EMPTY,
        candidates: toCandidates(found),
        reason: "사업자번호와 일치하는 사업장이 없습니다.",
      };
    }
    if (ambiguous) {
      return {
        found: false,
        ...EMPTY,
        candidates: toCandidates(found),
        reason: "동명 후보를 하나로 좁히지 못했습니다. 사업자번호나 지역을 지정하세요.",
      };
    }

    const recent = [...rows]
      .sort((a, b) => text(a, "dataCrtYm").localeCompare(text(b, "dataCrtYm")))
      .slice(-MAX_MONTHS * 4);

    const measured = await Promise.all(
      recent.map(async (row) => {
        const seq = text(row, "seq");
        const [detail, period] = await Promise.all([
          call("getDetailInfoSearchV2", { seq }),
          call("getPdAcctoSttusInfoSearchV2", { seq, dataCrtYm: text(row, "dataCrtYm") }),
        ]);
        return { row, detail: detail[0] ?? {}, period: period[0] ?? {} };
      }),
    );

    const byMonth = new Map<string, typeof measured>();
    for (const entry of measured) {
      const ym = text(entry.row, "dataCrtYm");
      byMonth.set(ym, [...(byMonth.get(ym) ?? []), entry]);
    }

    const months: NpsMonth[] = [...byMonth.keys()]
      .sort()
      .slice(-MAX_MONTHS)
      .map((ym) => {
        const entries = byMonth.get(ym) ?? [];
        return {
          ym,
          subscribers: sum(entries.map((entry) => positive(text(entry.detail, "jnngpCnt")))),
          noticeAmount: sum(entries.map((entry) => positive(text(entry.detail, "crrmmNtcAmt")))),
          hired: sum(entries.map((entry) => positive(text(entry.period, "nwAcqzrCnt")))),
          departed: sum(entries.map((entry) => positive(text(entry.period, "lssJnngpCnt")))),
        };
      });

    const latestYm = months.at(-1)?.ym ?? "";
    const latest = byMonth.get(latestYm) ?? [];
    const head = latest[0] ?? measured.at(-1);
    const subscribers = months.at(-1)?.subscribers ?? null;
    const noticeAmount = months.at(-1)?.noticeAmount ?? null;
    const withdrawnAt = text(head?.detail ?? {}, "scsnDt");
    const first = months[0]?.subscribers ?? null;

    return {
      found: true,
      companyName: text(head?.row ?? {}, "wkplNm"),
      businessNoPrefix: businessNoPrefix(text(head?.row ?? {}, "bzowrRgstNo")) ?? undefined,
      address: text(head?.row ?? {}, "wkplRoadNmDtlAddr") || undefined,
      industry: text(head?.detail ?? {}, "vldtVlKrnNm") || undefined,
      industryCode: text(head?.detail ?? {}, "wkplIntpCd") || undefined,
      registeredAt: text(head?.detail ?? {}, "adptDt") || undefined,
      withdrawnAt: withdrawnAt && withdrawnAt !== NO_WITHDRAWAL ? withdrawnAt : undefined,
      isSubscribed: latest.some((entry) => text(entry.row, "wkplJnngStcd") === "1"),
      workplaceCount: latest.length,
      subscribers,
      noticeAmount,
      averageBaseIncome:
        subscribers && noticeAmount ? Math.round(noticeAmount / subscribers / CONTRIBUTION_RATE) : null,
      annualPayroll: noticeAmount ? Math.round((noticeAmount / CONTRIBUTION_RATE) * 12) : null,
      months,
      growth:
        first !== null && subscribers !== null
          ? { from: first, to: subscribers, delta: subscribers - first, ratio: (subscribers - first) / first }
          : null,
    };
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
    return { found: false, ...EMPTY, failed: true, reason: `국민연금 조회 실패: ${reason}` };
  }
}
