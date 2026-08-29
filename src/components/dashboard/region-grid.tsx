"use client";

import { useState } from "react";
import { shortSido } from "@/lib/services/regionCode";
import type { RegionView } from "@/lib/services/regionRollup";

const number = new Intl.NumberFormat("ko-KR");
const TONES = 4;

/**
 * 시도 17개를 실제 위치를 흉내 낸 격자에 앉힌다.
 * 지형 지도는 서울에 21개사가 한 점으로 겹쳐 읽히지 않는다. 면적을 버리고 칸을 고르게 두면 값끼리 비교가 된다.
 */
const LAYOUT: Array<Array<string | null>> = [
  [null, "경기도", "강원특별자치도", null],
  ["인천광역시", "서울특별시", null, null],
  ["충청남도", "세종특별자치시", "충청북도", "경상북도"],
  [null, "대전광역시", "대구광역시", "울산광역시"],
  ["전라북도", null, "경상남도", "부산광역시"],
  ["전라남도", "광주광역시", null, null],
  ["제주특별자치도", null, null, null],
];

function tone(rank: number, total: number) {
  if (total <= 1) return 0;

  return Math.min(TONES - 1, Math.floor((rank / total) * TONES));
}

export function RegionGrid({ view }: { view: RegionView }) {
  const [active, setActive] = useState<string | null>(null);

  const byProvince = new Map(view.sido.map((entry) => [entry.sido, entry]));
  const ranked = new Map(view.sido.map((entry, rank) => [entry.sido, tone(rank, view.sido.length)]));
  const districts = new Map<string, string[]>();
  for (const entry of view.sigungu) {
    districts.set(entry.sido, [...(districts.get(entry.sido) ?? []), `${entry.sigungu} ${entry.names.join("·")}`]);
  }

  const focused = active ? byProvince.get(active) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ul
        className="grid min-h-0 flex-1 grid-cols-4 gap-1.5"
        style={{ gridTemplateRows: `repeat(${LAYOUT.length}, minmax(0, 1fr))` }}
        onMouseLeave={() => setActive(null)}
      >
        {LAYOUT.flatMap((row, y) =>
          row.map((name, x) => {
            if (!name) return <li key={`${y}-${x}`} aria-hidden />;
            const entry = byProvince.get(name);
            const label = entry
              ? `${shortSido(name)} ${entry.companies}개사 ${number.format(entry.subscribers)}명${
                  entry.conflicts > 0 ? ` · 주소 충돌 ${entry.conflicts}` : ""
                }`
              : `${shortSido(name)} 0개사`;

            return (
              <li
                key={`${y}-${x}`}
                aria-label={label}
                onMouseEnter={() => setActive(name)}
                className={`flex flex-col justify-between rounded-md border px-2 py-1.5 ${
                  entry ? "border-transparent" : "border-dashed border-border"
                }`}
                style={entry ? { background: `var(--cloud-${ranked.get(name) ?? 0})` } : undefined}
              >
                <span
                  className={`truncate text-[11px] font-bold ${entry ? "text-background" : "text-muted-foreground"}`}
                >
                  {shortSido(name)}
                  {entry && entry.conflicts > 0 ? <span className="ml-1 text-risk">▲</span> : null}
                </span>
                {entry ? (
                  <span className="font-mono text-[15px] font-bold leading-none tabular-nums text-background">
                    {entry.companies}
                    <span className="ml-1 text-[10px] font-normal opacity-80">
                      {number.format(entry.subscribers)}명
                    </span>
                  </span>
                ) : null}
              </li>
            );
          }),
        )}
      </ul>

      <p
        role="status"
        aria-live="polite"
        className="min-h-[2.25rem] shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] leading-tight"
      >
        {focused
          ? `${focused.sido} · ${focused.companies}개사 · ${number.format(focused.subscribers)}명 · ${
              districts.get(focused.sido)?.join(", ") ?? "시군구 미상"
            }`
          : `${view.located}/${view.total}개사 배치 · 칸에 마우스를 올리면 시군구를 보여줍니다.`}
      </p>

      <p className="shrink-0 text-[10.5px] text-muted-foreground">
        {view.unlocated.length > 0
          ? `주소 없음 ${view.unlocated.length}곳 · ${view.unlocated.join(", ")}`
          : `면적이 아니라 값을 비교하는 배치입니다 · 칸 색은 가입자 순위`}
      </p>
    </div>
  );
}
