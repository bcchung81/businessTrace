"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ArticleRow = {
  link: string;
  title: string;
  source: string;
  published: string;
  isAbout: boolean;
  held: boolean;
  confidence: number | null;
  judgment: { id: number; about: string | null } | null;
};

type QueueResult = { ok: true; id: number } | { ok: false; message: string };

const HUMAN_LABEL: Record<string, string> = { yes: "주제", no: "주제 아님", unsure: "모름" };

const analyzerLabel = (row: ArticleRow) => `${row.isAbout ? "주제" : row.held ? "보류" : "주제 아님"} ${row.confidence === null ? "—" : row.confidence.toFixed(2)}`;

const analyzerTone = (row: ArticleRow) => (row.isAbout ? "text-foreground" : row.held ? "text-review" : "text-muted-foreground");

/**
 * 마지막으로 끝낸 분석의 기사 — 분석기가 어떻게 판정했는지 보이고, 틀려 보이면 판정 대기열에 올린다.
 * 올린 기사는 버튼 대신 사람 판정 상태와 06 판정으로 가는 링크를 보인다.
 */
export function ArticleList({
  companyId,
  runId,
  articles,
  queue,
}: {
  companyId: number;
  runId: number;
  articles: ArticleRow[];
  queue: (input: { companyId: number; runId: number; link: string }) => Promise<QueueResult>;
}) {
  const [queued, setQueued] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const add = async (link: string) => {
    setBusy(link);
    setMessage(null);
    const result = await queue({ companyId, runId, link });
    setBusy(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setQueued((current) => ({ ...current, [link]: result.id }));
  };

  return (
    <div className="flex flex-col gap-2">
      {message ? <p className="text-[12px] font-bold text-review">{message}</p> : null}
      <ul className="flex flex-col">
        {articles.map((row) => {
          const judgment = row.judgment ?? (queued[row.link] ? { id: queued[row.link], about: null } : null);
          return (
            <li key={row.link} className="grid gap-2 border-b border-hairline py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_110px_150px] sm:items-center">
              <div className="flex min-w-0 flex-col gap-0.5">
                <a href={row.link} target="_blank" rel="noreferrer" className="truncate text-[13px] font-bold underline-offset-2 hover:underline">
                  {row.title}
                </a>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {row.source} · {row.published}
                </span>
              </div>
              <span className={`text-[12px] tabular-nums ${analyzerTone(row)}`}>{analyzerLabel(row)}</span>
              <div className="flex flex-col items-start gap-0.5 sm:items-end">
                {judgment ? (
                  <>
                    <span className="text-[12px] font-bold">사람: {judgment.about ? HUMAN_LABEL[judgment.about] ?? judgment.about : "미판정"}</span>
                    <Link href="/judgments" className="text-[11px] text-muted-foreground underline underline-offset-2">
                      대기열에 있음
                    </Link>
                  </>
                ) : (
                  <Button type="button" variant="signal-outline" size="xs" disabled={busy === row.link} onClick={() => void add(row.link)}>
                    판정 대기열에 올리기
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
