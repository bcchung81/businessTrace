"use client";

import { useState } from "react";
import { WordCloud, type CloudFormatter, type CloudItem } from "@/components/dashboard/word-cloud";

export type CloudDataset = {
  key: string;
  label: string;
  unit: string;
  formatter?: CloudFormatter;
  items: CloudItem[];
};

/**
 * 같은 기업 집합을 기준만 바꿔가며 한 클라우드로 본다.
 * 기준마다 카드를 따로 두면 어느 수치를 보고 있는지 놓친다. 선택한 기준을 탭으로 못 박는다.
 */
export function CloudBoard({ datasets }: { datasets: CloudDataset[] }) {
  const [active, setActive] = useState(datasets[0]?.key ?? "");
  const dataset = datasets.find((entry) => entry.key === active) ?? datasets[0];

  if (!dataset) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div role="tablist" aria-label="크기 기준" className="flex shrink-0 flex-wrap gap-1.5">
        {datasets.map((entry) => {
          const selected = entry.key === dataset.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(entry.key)}
              className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                selected
                  ? "border-primary bg-accent font-semibold text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-surface"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <WordCloud items={dataset.items} unit={dataset.unit} formatter={dataset.formatter} />
    </div>
  );
}
