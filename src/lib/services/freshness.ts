import { KST_OFFSET_MS } from "@/lib/services/kst";
import { STALE_DAYS } from "@/lib/services/newsCoverage";

const DAY_MS = 86_400_000;

/**
 * 월간 문서 요약 시트가 쓰는 수집 시점 묶음. 리본은 더 이상 이 형태를 쓰지 않는다.
 */
export type FreshnessInput = {
  now: Date;
  latestNewsAt: string | null;
  latestSourceAt: string | null;
  sourcesUpdatedToday: number;
  sourcesTotal: number;
  pensionYm: string | undefined;
  running: number;
  openEvents: number;
  stale: number;
};

export type TodoKind = "review" | "events" | "verification";
export type TodoRow = { companyId: number; name: string; note: string; selectable: boolean };
export type RibbonTodo = { kind: TodoKind; rows: TodoRow[] };
export type RibbonItem = { text: string; href?: string; stale?: boolean; todo?: RibbonTodo };
export type RibbonGroup = { label: string; items: RibbonItem[] };

export type ReviewListItem = { id: number; name: string; reasons: string[]; failed: string[] };
export type OpenEventItem = { id: number; companyId: number; companyName: string; title: string; severity: "alert" | "notice" };

export type RibbonInput = {
  now: Date;
  latestNewsAt: string | null;
  fullSourceRefreshAt: string | null;
  pensionYm: string | undefined;
  reviewCompanies: number;
  openAlertNotice: number;
  needsReview: number;
  reviewItems: ReviewListItem[];
  needsReviewItems: ReviewListItem[];
  openEvents: OpenEventItem[];
  year: number;
};

/**
 * 다음 국민연금 스냅샷 적재일 — 최신 스냅샷 다음 달 15일이되, 이미 지났으면 다가오는 15일로 민다.
 * 공단은 매월 15일 이후에 전월치를 올린다 (CLAUDE.md). 지난 날짜를 "다음" 으로 보이면 안 된다.
 */
export function nextPensionDate(ym: string | undefined, now: Date) {
  if (!ym || ym.length !== 6) return "—";
  let year = Number(ym.slice(0, 4));
  let month = Number(ym.slice(4, 6)) + 1;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  for (;;) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const candidate = Date.UTC(year, month - 1, 15);
    if (candidate >= Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())) break;
    month += 1;
  }
  return `${String(month).padStart(2, "0")}-15`;
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

function kstDay(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return { md: `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`, day: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
}

function dated(label: string, iso: string | null, now: Date): RibbonItem {
  if (!iso) return { text: `${label} —` };
  const { md, day } = kstDay(iso);
  const today = kstDay(now.toISOString()).day;
  const age = Math.round((today - day) / DAY_MS);
  const ageText = age <= 0 ? "오늘" : `${age}일 전`;
  const stale = age > STALE_DAYS;
  return { text: `${label} ${md} (${ageText})${stale ? " · 낡음" : ""}`, stale };
}

/**
 * 셀 자체가 목록일 때만 팝업을 단다 — 펼칠 것이 없는 0 은 링크도 팝업도 없는 글자로 남는다.
 */
function todo(kind: TodoKind, rows: TodoRow[]): RibbonTodo | undefined {
  return rows.length > 0 ? { kind, rows } : undefined;
}

/**
 * 미확인 사건을 기업 단위로 묶는다 — 같은 기업이 사건 수만큼 반복되면 고를 목록이 아니라 로그가 된다.
 * 첫 사건(최신)의 제목을 대표로 쓰고 건수를 앞에 적는다.
 */
function groupOpenEvents(events: OpenEventItem[]): TodoRow[] {
  const byCompany = new Map<number, { label: string; count: number; alerts: number; title: string; severity: OpenEventItem["severity"] }>();
  for (const event of events) {
    const entry = byCompany.get(event.companyId);
    if (entry) {
      entry.count += 1;
      if (event.severity === "alert") entry.alerts += 1;
    } else {
      byCompany.set(event.companyId, { label: event.companyName, count: 1, alerts: event.severity === "alert" ? 1 : 0, title: event.title, severity: event.severity });
    }
  }
  return [...byCompany.entries()].map(([companyId, entry]) => ({
    companyId,
    name: entry.label,
    note: entry.count === 1 ? `${entry.severity === "alert" ? "경보" : "주의"} · ${entry.title}` : `${entry.count}건(경보 ${entry.alerts}) · ${entry.title}`,
    selectable: true,
  }));
}

/**
 * 리본 두 묶음 — 이 화면의 숫자가 언제 것인지(기준일 3) 와 운영자가 지금 할 일(할 일 3).
 * 할 일은 처리할 목록을 팝업으로 열고 그 안에서 정리한다 — 화면을 떠나지 않는다.
 * 파이프라인 수치는 밴드가 보여주므로 여기 두지 않는다. 0 도 남긴다(§2-K).
 */
export function buildRibbonGroups(input: RibbonInput): RibbonGroup[] {
  return [
    {
      label: "기준일",
      items: [
        dated("뉴스", input.latestNewsAt, input.now),
        dated("원천", input.fullSourceRefreshAt, input.now),
        { text: `연금 ${monthLabel(input.pensionYm)} · 다음 적재 ${nextPensionDate(input.pensionYm, input.now)}` },
      ],
    },
    {
      label: "할 일",
      items: [
        {
          text: `확인 필요 ${input.reviewCompanies}개사`,
          todo: todo(
            "review",
            input.reviewItems.map((item) => ({ companyId: item.id, name: item.name, note: item.reasons.join(" · "), selectable: item.reasons.some((reason) => reason.startsWith("미확인 경보·주의")) })),
          ),
        },
        {
          text: `미확인 경보·주의 ${input.openAlertNotice}`,
          todo: todo("events", groupOpenEvents(input.openEvents)),
        },
        {
          text: `검토 필요 ${input.needsReview}`,
          todo: todo("verification", input.needsReviewItems.map((item) => ({ companyId: item.id, name: item.name, note: item.failed.length > 0 ? item.failed.join(" · ") : "검증 검토", selectable: true }))),
        },
      ],
    },
  ];
}
