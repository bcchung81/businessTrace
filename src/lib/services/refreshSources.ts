import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listSourceDecisions } from "@/lib/repositories/sourceDecision";
import { listSourceSnapshots, saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { collectEvidence, type CollectedEvidence, type Decisions } from "@/lib/services/collectEvidence";
import { extractSourceEvents } from "@/lib/services/eventRules";
import { toSnapshots, type SnapshotRow } from "@/lib/services/sourceEvidence";

export type RefreshOutcome = CollectedEvidence & { snapshots: SnapshotRow[] };

/**
 * 한 기업의 공식 원천을 다시 조회해 스냅샷·사건·사업자번호를 갱신한다 — 단건 버튼, 일괄 실행, 확인 필요 결정이 전부 이 순서를 쓴다.
 * 운영자 결정(동명 충돌 선택)을 먼저 읽어 조회에 고정한다. 업종은 건드리지 않는다 — DART 업종 코드가 이름 자리에 들어가던 문제.
 */
export async function refreshSourcesFor(companyId: number, deps: { collect?: typeof collectEvidence } = {}): Promise<RefreshOutcome | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;
  const decisions = Object.fromEntries((await listSourceDecisions(companyId)).map((d) => [d.source, d.value])) as Decisions;
  const collected = await (deps.collect ?? collectEvidence)(company, undefined, decisions);
  const snapshots = toSnapshots(collected.evidence);
  await saveSourceSnapshots(companyId, snapshots);
  await upsertEvents(extractSourceEvents({ companyId, snapshots: await listSourceSnapshots(companyId), now: new Date() }));
  if (collected.businessNo && collected.businessNo !== company.businessNo) {
    await updateCompany(companyId, { businessNo: collected.businessNo });
  }
  return { ...collected, snapshots };
}
