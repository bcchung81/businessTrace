"use client";

import { useRouter } from "next/navigation";
import { RefreshSourcesButton } from "@/components/company/refresh-sources-button";

/**
 * 조회가 끝나면 서버 컴포넌트를 다시 그려 새 스냅샷을 반영한다.
 */
export function RefreshSources({ companyId, fetchImpl }: { companyId: number; fetchImpl?: typeof fetch }) {
  const router = useRouter();
  return (
    <RefreshSourcesButton companyId={companyId} fetchImpl={fetchImpl} onDone={() => router.refresh()} />
  );
}
