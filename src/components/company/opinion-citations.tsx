"use client";

import { useState } from "react";
import type { CitedSentence } from "@/lib/services/explainer";

/**
 * 종합의견을 문장 단위로 펼치고, 올리면 일치 기사 단락을 팝오버로 보인다.
 * 인용 여부는 색이 아니라 점선 밑줄과 data-cited 로 말한다 — 근거 없는 문장도 "없음" 이라고 적는다.
 */
export function OpinionCitations({ sentences }: { sentences: CitedSentence[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <p className="relative text-[13px] leading-[1.8]">
      {sentences.map((entry, index) => {
        const cited = entry.snippets.length > 0;
        return (
          <span key={index} className="relative">
            <span
              tabIndex={0}
              data-cited={cited ? "true" : "false"}
              onMouseEnter={() => setOpen(index)}
              onMouseLeave={() => setOpen(null)}
              onFocus={() => setOpen(index)}
              onBlur={() => setOpen(null)}
              className={cited ? "cursor-help underline decoration-dotted decoration-primary underline-offset-4" : "text-muted-foreground"}
            >
              {entry.sentence}
            </span>{" "}
            {open === index ? (
              <span
                role="tooltip"
                className="absolute left-0 top-full z-20 mt-1 flex w-[360px] flex-col gap-2 border-[1.5px] border-ink bg-background p-3 text-[12px] leading-snug"
              >
                {cited ? (
                  entry.snippets.map((snippet) => (
                    <span key={snippet.link} className="flex flex-col gap-1">
                      <a href={snippet.link} target="_blank" rel="noreferrer" className="font-bold underline decoration-dotted underline-offset-2">
                        {snippet.title}
                      </a>
                      <span className="font-mono text-[10.5px] text-muted-foreground">일치 {snippet.score.toFixed(2)}</span>
                      <mark className="bg-accent text-foreground">{snippet.paragraph}</mark>
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">일치 기사 없음</span>
                )}
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}
