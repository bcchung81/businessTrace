"use client";

import { useRef, useState } from "react";
import { submitFileAction } from "@/app/reports/actions";
import { Button } from "@/components/ui/button";
import { Pager, paginate } from "@/components/ui/pager";
import type { SubmissionRow } from "@/lib/repositories/submission";
import { formatRunTime } from "@/lib/services/formatRunTime";

/**
 * 제출 자료 보관함 — 파일명·제출일·해시 앞 12자리를 표로 남긴다. 해시가 "그때 낸 파일" 의 증명이다.
 */
export function SubmissionBox({ submissions }: { submissions: SubmissionRow[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const { slice, pages, current } = paginate(submissions, page);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.current) return;
    setBusy(true);
    const result = await submitFileAction(new FormData(form.current));
    setBusy(false);
    setMessage(result.ok ? "보관했습니다." : result.message);
    if (result.ok) form.current.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <form ref={form} onSubmit={submit} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        <input type="file" name="file" aria-label="제출 파일" className="text-[12.5px]" />
        <input type="text" name="note" placeholder="메모 (선택)" aria-label="메모" className="border-[1.5px] border-hairline bg-background px-2 py-1 text-[12.5px]" />
        <Button type="submit" variant="signal-outline" size="sm" disabled={busy}>
          보관
        </Button>
        {message ? <span className="text-[12px] text-muted-foreground">{message}</span> : null}
      </form>
      {submissions.length === 0 ? (
        <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">보관된 제출 자료가 없습니다.</p>
      ) : (
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="py-1.5 pr-2 font-semibold">파일명</th>
              <th className="py-1.5 pr-2 font-semibold">제출일</th>
              <th className="py-1.5 pr-2 font-semibold">해시</th>
              <th className="py-1.5 pr-2 text-right font-semibold">크기</th>
              <th className="py-1.5 font-semibold">메모</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.id} className="border-b border-hairline">
                <td className="py-1.5 pr-2 font-semibold">{row.filename}</td>
                <td className="whitespace-nowrap py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">{formatRunTime(row.submittedAt)}</td>
                <td className="py-1.5 pr-2 font-mono text-[11.5px] text-muted-foreground">{row.sha256.slice(0, 12)}</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{Math.ceil(row.size / 1024)}KB</td>
                <td className="py-1.5 text-muted-foreground">{row.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager current={current} pages={pages} onPage={setPage} />
    </div>
  );
}
