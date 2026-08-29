import { StateLegend } from "@/components/dashboard/state-legend";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import type { SourceKey, SourceStatus } from "@/lib/services/sourceEvidence";

const SOURCE_LABEL: Record<SourceKey, { name: string; org: string }> = {
  dart: { name: "DART 기업개황", org: "금융감독원" },
  dartFinance: { name: "DART 재무제표", org: "금융감독원" },
  fsc: { name: "기업기본정보", org: "금융위원회" },
  nts: { name: "국세청 휴폐업", org: "국세청" },
  narajangteo: { name: "조달업체 정보", org: "나라장터" },
  venture: { name: "벤처확인", org: "중소벤처기업부" },
  nps: { name: "가입 사업장", org: "국민연금공단" },
};

const STATUS_LABEL: Record<SourceStatus, string> = {
  found: "확인",
  absent: "결측",
  unmeasurable: "측정 불가",
  conflict: "충돌",
  pending: "미조회",
};

const STATUS_CLASS: Record<SourceStatus, string> = {
  found: "border-verified/30 bg-verified-surface text-verified",
  absent: "hatch border-hairline text-muted-foreground",
  unmeasurable: "border-dashed border-muted-foreground/60 text-muted-foreground",
  conflict: "border-risk/35 bg-risk-surface text-risk",
  pending: "border-hairline bg-surface text-muted-foreground",
};

function day(at: Date) {
  return at.toISOString().slice(0, 10);
}

/**
 * 원천별 조회 결과를 한 화면에 세운다.
 * 빈칸을 네 종류로 갈라 쓴다 — 결측·측정 불가·충돌·미조회는 처방이 서로 다르다.
 */
export function EvidenceGrid({ snapshots }: { snapshots: StoredSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        원천 조회를 아직 실행하지 않았습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="원천 대조" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {snapshots.map((snapshot) => {
        const label = SOURCE_LABEL[snapshot.source];
        return (
          <li
            key={snapshot.source}
            className={`rounded-lg border px-3 py-2.5 ${STATUS_CLASS[snapshot.status]}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-foreground">{label.name}</span>
              <span className="text-[11px] font-bold">{STATUS_LABEL[snapshot.status]}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-foreground">{snapshot.summary}</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {label.org} · {day(snapshot.fetchedAt)}
            </p>
          </li>
        );
      })}
      </ul>
      <StateLegend />
    </div>
  );
}
