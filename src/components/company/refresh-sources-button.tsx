"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  companyId: number;
  onDone: () => void;
  fetchImpl?: typeof fetch;
};

/**
 * 여섯 원천을 다시 조회해 스냅샷을 갱신한다.
 * 조회는 외부 API 여섯 곳을 도는 느린 작업이라 진행 상태를 드러내고 중복 클릭을 막는다.
 */
export function RefreshSourcesButton({ companyId, onDone, fetchImpl = fetch }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchImpl(`/api/companies/${companyId}/dart`, { method: "POST" });
      if (!response.ok) {
        setError(`조회 실패 (${response.status})`);
        return;
      }
      onDone();
    } catch (caught) {
      setError(`조회 실패 — ${caught instanceof Error ? caught.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={run} disabled={busy} variant="outline" size="sm">
        {busy ? "조회 중…" : "원천 조회"}
      </Button>
      {error ? (
        <p role="alert" className="text-[12px] font-medium text-risk">
          {error}
        </p>
      ) : null}
    </div>
  );
}
