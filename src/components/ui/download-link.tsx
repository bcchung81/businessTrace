"use client";

import { useState, type ReactNode } from "react";

function filenameOf(header: string | null, fallback: string) {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/);
  if (star) return decodeURIComponent(star[1]);
  const plain = header?.match(/filename="?([^";]+)"?/);
  return plain ? plain[1] : fallback;
}

/**
 * 워크북을 받는 링크 — 서버가 만드는 몇 초 동안 "생성 중…" 을 보이고 재클릭을 막는다.
 * 파일명은 서버의 Content-Disposition 을 그대로 쓴다.
 */
export function DownloadLink({ href, children, className = "", fetchImpl = fetch }: { href: string; children: ReactNode; className?: string; fetchImpl?: typeof fetch }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchImpl(href);
      if (!response.ok) {
        setError(`생성 실패 (${response.status})`);
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameOf(response.headers.get("Content-Disposition"), "download.xlsx");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(`생성 실패 — ${caught instanceof Error ? caught.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={download} disabled={busy} aria-busy={busy} className={className}>
        {busy ? "생성 중…" : children}
      </button>
      {error ? <span role="alert" className="text-[11.5px] font-medium text-risk">{error}</span> : null}
    </span>
  );
}
