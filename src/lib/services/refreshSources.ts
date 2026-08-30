import { prisma } from "@/lib/db";
import { updateCompany } from "@/lib/repositories/companyRepository";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listSourceDecisions } from "@/lib/repositories/sourceDecision";
import { listSourceSnapshots, saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { collectEvidence, type CollectedEvidence, type Decisions } from "@/lib/services/collectEvidence";
import { extractSourceEvents } from "@/lib/services/eventRules";
import { needsIndustry, pickIndustry } from "@/lib/services/industryBackfill";
import { toSnapshots, type SnapshotRow } from "@/lib/services/sourceEvidence";

export type RefreshOutcome = CollectedEvidence & { snapshots: SnapshotRow[] };

/**
 * 한 기업의 공식 원천을 다시 조회해 스냅샷·사건·사업자번호를 갱신한다 — 단건 버튼, 일괄 실행, 확인 필요 결정이 전부 이 순서를 쓴다.
 * 운영자 결정(동명 충돌 선택)을 먼저 읽어 조회에 고정한다. 업종은 비었거나 숫자 코드일 때만 벤처·연금 업종명으로 채운다 — 이름 자리를 코드로 덮지 않는다.
 */
export async function refreshSourcesFor(companyId: number, deps: { collect?: typeof collectEvidence } = {}): Promise<RefreshOutcome | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;
  const decisions = Object.fromEntries((await listSourceDecisions(companyId)).map((d) => [d.source, d.value])) as Decisions;
  const collected = await (deps.collect ?? collectEvidence)(company, undefined, decisions);
  const snapshots = toSnapshots(collected.evidence, collected.businessNo);
  await saveSourceSnapshots(companyId, snapshots);
  const stored = await listSourceSnapshots(companyId);
  await upsertEvents(extractSourceEvents({ companyId, snapshots: stored, now: new Date() }));
  const patch: { businessNo?: string; industry?: string } = {};
  if (collected.businessNo && collected.businessNo !== company.businessNo) patch.businessNo = collected.businessNo;
  const industry = needsIndustry(company.industry) ? pickIndustry(stored) : null;
  if (industry) patch.industry = industry;
  if (Object.keys(patch).length > 0) await updateCompany(companyId, patch);
  return { ...collected, snapshots };
}
