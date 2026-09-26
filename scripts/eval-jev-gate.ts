import { config } from "dotenv";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { listGateLabels } from "@/lib/repositories/articleJudgment";
import { findCompanyIdentity } from "@/lib/repositories/companyRepository";
import type { NewsAnalysis } from "@/lib/services/analyzer";
import { parseAliases } from "@/lib/services/collectForCompany";
import { buildArticleRequest, interpretAnswers, type CompanyProfile } from "@/lib/services/jevAnalyzer";
import { GATE_SET_KEY } from "@/lib/services/judgments";
import { cohenKappa, humanTruth, passesGate, scoreAbout, sentimentEvent, spearman, stratifiedAccuracy, wilson, GATE_MIN } from "@/lib/services/jevGate";
import type { NewsItem } from "@/lib/services/newsTypes";
import { defaultJevClient, type JevAnswer } from "@/lib/services/typesafe";

config({ quiet: true });

const DIR = join(process.cwd(), "data", "jev-gate");
const CACHE = join(DIR, "results-v3.jsonl");

type Gold = {
  runId: number;
  companyId: number;
  company: string;
  title: string;
  source: string;
  published: string;
  link: string;
  body: string;
  isAbout: 0 | 1;
  negativeKind: string;
  award: "Y" | "N";
  investment: "Y" | "N";
  round: string;
};
type ReviewKey = { id: string; stratum: string; companyId: number; link: string; strataSizes: Record<string, number> };
type Cached = { key: string; requestHash: string; model?: string; inputTokens?: number; ms?: number; answers?: Record<string, JevAnswer>; error?: string };
type Scored = { gold: Gold; analysis: NewsAnalysis; sonnetSentiment: number | null };

const keyOf = (companyId: number, link: string) => `${companyId}|${link}`;
const pct = (value: number) => (Number.isNaN(value) ? "—" : `${(value * 100).toFixed(1)}%`);
const interval = ([low, high]: [number, number]) => `[${pct(low)}, ${pct(high)}]`;
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

function toNewsItem(gold: Gold): NewsItem {
  return {
    title: gold.title,
    link: gold.link,
    description: "",
    content: gold.body,
    published: gold.published,
    source: gold.source,
    provider: "naver",
    titleMatch: gold.title.includes(gold.company),
    mentions: 0,
    relevance: "primary",
  };
}

/**
 * 원답 캐시를 읽는다. 질문이나 state 가 바뀌면 요청 해시가 달라져 다시 묻는다 — 문구를 고친 뒤 옛 답으로 채점하지 않게 한다.
 */
function loadCache(): Map<string, Cached> {
  if (!existsSync(CACHE)) return new Map();
  const rows = readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Cached);
  return new Map(rows.filter((row) => row.answers).map((row) => [row.key, row]));
}

async function loadProfiles(golds: Gold[]): Promise<Map<number, CompanyProfile>> {
  const profiles = new Map<number, CompanyProfile>();
  for (const gold of golds) {
    if (profiles.has(gold.companyId)) continue;
    const row = await findCompanyIdentity(gold.companyId);
    profiles.set(
      gold.companyId,
      row ? { name: row.name, officialName: row.officialName, industry: row.industry, ceoName: row.ceoName, aliases: parseAliases(row.aliases) } : { name: gold.company, aliases: [] },
    );
  }
  return profiles;
}

/**
 * gold 를 만든 실행의 결과에서 Sonnet 감성 점수를 꺼낸다. gold.json 에는 감성이 없다.
 */
async function loadSonnetSentiments(golds: Gold[]): Promise<Map<string, number>> {
  const runs = await prisma.analysisRun.findMany({ where: { id: { in: [...new Set(golds.map((gold) => gold.runId))] } }, select: { id: true, resultJson: true } });
  const sentiments = new Map<string, number>();
  for (const run of runs) {
    const analyses = (run.resultJson ? (JSON.parse(run.resultJson) as { analyses?: NewsAnalysis[] }).analyses : undefined) ?? [];
    for (const analysis of analyses) sentiments.set(`${run.id}|${analysis.news.link}`, analysis.trend.sentiment_score);
  }
  return sentiments;
}

/**
 * 캐시에 없는 기사만 Jev 에 묻고 원답을 한 줄씩 덧붙인다. 도중에 끊겨도 다시 돌리면 이어서 묻는다.
 */
async function askPending(golds: Gold[], profiles: Map<number, CompanyProfile>, cache: Map<string, Cached>, concurrency: number) {
  const jev = defaultJevClient();
  const pending = golds
    .map((gold) => ({ gold, request: buildArticleRequest(profiles.get(gold.companyId)!, toNewsItem(gold)) }))
    .map((entry) => ({ ...entry, requestHash: createHash("sha256").update(JSON.stringify([entry.request.state, entry.request.questions])).digest("hex").slice(0, 16) }))
    .filter(({ gold, requestHash }) => cache.get(keyOf(gold.companyId, gold.link))?.requestHash !== requestHash);

  console.log(`Jev 요청 ${pending.length}건 (캐시 ${golds.length - pending.length}건)`);
  let finished = 0;
  for (let start = 0; start < pending.length; start += concurrency) {
    await Promise.all(
      pending.slice(start, start + concurrency).map(async ({ gold, request, requestHash }) => {
        const key = keyOf(gold.companyId, gold.link);
        const began = performance.now();
        let row: Cached;
        try {
          const response = await jev.ask(request.state, request.questions);
          row = { key, requestHash, model: response.model, inputTokens: response.inputTokens, ms: Math.round(performance.now() - began), answers: response.answers };
          cache.set(key, row);
        } catch (caught) {
          row = { key, requestHash, error: caught instanceof Error ? caught.message : String(caught) };
        }
        appendFileSync(CACHE, `${JSON.stringify(row)}\n`);
        finished += 1;
        if (finished % 25 === 0 || finished === pending.length) console.log(`  ${finished}/${pending.length}`);
      }),
    );
  }
}

function binaryLine(name: string, pairs: [boolean, boolean][]) {
  const truePositive = pairs.filter(([gold, jev]) => gold && jev).length;
  const falsePositive = pairs.filter(([gold, jev]) => !gold && jev).length;
  const falseNegative = pairs.filter(([gold, jev]) => gold && !jev).length;
  const agree = pairs.length - falsePositive - falseNegative;
  const kappa = cohenKappa(pairs.map(([a, b]) => [String(a), String(b)]));
  console.log(`  ${name.padEnd(8)} 일치 ${pct(agree / pairs.length)} · κ ${kappa.toFixed(2)} · 양성 ${truePositive + falseNegative}건 중 재현 ${truePositive} · 오탐 ${falsePositive}`);
}

function reportAgainstSonnet(rows: Scored[]) {
  const about = scoreAbout(
    rows.map((row) => ({ truth: row.gold.isAbout === 1, about: row.analysis.isAboutCompany, held: row.analysis.held ?? false, confidence: row.analysis.trend.about_confidence ?? 0, row })),
  );
  console.log("\n[Sonnet 기준 — 참고치, 게이트 판정 아님]");
  console.log(`  주제     일치 ${pct(about.agree / about.n)} ${interval(wilson(about.agree, about.n))} · AUC ${about.auc.toFixed(3)} · 보류 ${about.held}건(주제 아님으로 셈)`);
  console.log(`           보류 뺀 확정분 ${about.decisive.agree}/${about.decisive.n} = ${pct(about.decisive.agree / about.decisive.n)}`);

  for (const threshold of [0.5, 0.6, 0.7, 0.8]) {
    const agree = rows.filter((row) => ((row.analysis.trend.about_confidence ?? 0) >= threshold) === (row.gold.isAbout === 1)).length;
    const held = rows.filter((row) => {
      const confidence = row.analysis.trend.about_confidence ?? 0;
      return confidence < threshold && confidence >= 0.3;
    }).length;
    console.log(`           문턱 ${threshold}: 일치 ${pct(agree / rows.length)} · 0.3~문턱 보류 ${held}건`);
  }

  binaryLine("수상", rows.map((row) => [row.gold.award === "Y", row.analysis.award.is_award_related === "Y"]));
  binaryLine("투자", rows.map((row) => [row.gold.investment === "Y", row.analysis.investment.is_investment_related === "Y"]));
  const negative = rows.map((row): [string, string] => [row.gold.negativeKind, row.analysis.trend.negative_kind ?? "none"]);
  console.log(`  부정유형 κ ${cohenKappa(negative).toFixed(2)} · Sonnet 비none ${negative.filter(([a]) => a !== "none").length}건 · Jev 비none ${negative.filter(([, b]) => b !== "none").length}건`);
  const round = rows.map((row): [string, string] => [row.gold.round, row.analysis.investment.investment_round ?? "none"]);
  console.log(`  라운드   κ ${cohenKappa(round).toFixed(2)}`);

  const both = rows.filter((row) => row.gold.isAbout === 1 && row.analysis.isAboutCompany && row.sonnetSentiment !== null);
  const rho = spearman(both.map((row) => row.sonnetSentiment!), both.map((row) => row.analysis.trend.sentiment_score));
  const events = both.filter((row) => sentimentEvent(row.sonnetSentiment!) === sentimentEvent(row.analysis.trend.sentiment_score)).length;
  console.log(`  감성     양쪽 주제 ${both.length}건 · 순위상관 ${rho.toFixed(2)} · 긍정/부정 보도 사건 일치 ${pct(events / both.length)}`);

  console.log(`\n  주제 불일치 ${about.misses.length}건 (S=Sonnet 정답, J=Jev 확신도)`);
  for (const miss of about.misses) {
    const { gold, analysis } = miss.row;
    console.log(`    ${gold.company.padEnd(10)} S=${gold.isAbout} J=${(analysis.trend.about_confidence ?? 0).toFixed(2)}${analysis.held ? "(보류)" : ""} | ${gold.title.slice(0, 56)}`);
  }
}

/**
 * 06 판정에서 내린 게이트 표본 판정(층화 표본: A 불일치·B 불확실 전수, C 확신 합의 표본)으로 전체 정확도를 추정한다.
 * Sonnet 도 같은 잣대로 잰다. 층 모집단 크기는 표본 설계라 review-key.json 에서 읽는다.
 */
async function reportAgainstHumans(rows: Scored[]) {
  const labels = await listGateLabels(GATE_SET_KEY);
  if (labels.length === 0) {
    console.log("\n[사람 정답] 게이트 표본이 판정 대기열에 없다 — npx tsx scripts/import-judgment-gate.ts 로 들인 뒤 06 판정에서 판정한다.");
    return;
  }
  const aboutByKey = new Map(labels.map((label) => [keyOf(label.companyId, label.link), label.about]));
  const keys = readJson<ReviewKey[]>(join(DIR, "review-key.json"));
  const byKey = new Map(rows.map((row) => [keyOf(row.gold.companyId, row.gold.link), row]));
  const judged = keys
    .map((key) => ({ key, truth: humanTruth({ about: aboutByKey.get(keyOf(key.companyId, key.link)) }), row: byKey.get(keyOf(key.companyId, key.link)) }))
    .filter((entry): entry is { key: ReviewKey; truth: boolean; row: Scored } => entry.truth !== null && entry.row !== undefined);

  const required = keys.filter((key) => key.stratum !== "C").length;
  const requiredDone = judged.filter((entry) => entry.key.stratum !== "C").length;
  const sizes = keys[0].strataSizes;
  const strataOf = (entry: (typeof judged)[number]) => (entry.key.stratum === "C" ? (entry.row.gold.isAbout === 1 ? "Cyes" : "Cno") : entry.key.stratum);
  const jev = stratifiedAccuracy(judged.map((entry) => ({ stratum: strataOf(entry), correct: entry.row.analysis.isAboutCompany === entry.truth })), sizes);
  const sonnet = stratifiedAccuracy(judged.map((entry) => ({ stratum: strataOf(entry), correct: (entry.row.gold.isAbout === 1) === entry.truth })), sizes);

  console.log(`\n[사람 정답 기준] 판정 ${judged.length}/${keys.length}건 · 필수(A·B) ${requiredDone}/${required}건`);
  if (jev.missing.length > 0) console.log(`  검토가 없는 층: ${jev.missing.join(", ")} — 그 층을 뺀 추정이다`);
  console.log(`  주제 정확도 추정 — Jev ${pct(jev.estimate)} · Sonnet ${pct(sonnet.estimate)}`);
  const verdict = requiredDone < required ? "보류 — 필수 판정이 덜 찼다" : passesGate(jev.estimate, "human") ? "통과" : "미달";
  console.log(`  게이트(≥${pct(GATE_MIN)}): ${verdict}`);
}

/**
 * Jev 분석기(분해 질문·회사 프로필)를 gold 272건에 돌려 채점한다. 06 판정의 게이트 판정이 있으면 그것으로 게이트를 판정한다.
 * 사용: npx tsx scripts/eval-jev-gate.ts [--concurrency=4] [--score-only]
 */
async function main() {
  const args = process.argv.slice(2);
  const concurrency = Number(args.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1]) || 4;
  const golds = readJson<Gold[]>(join(DIR, "gold.json"));
  const profiles = await loadProfiles(golds);
  const cache = loadCache();
  if (!args.includes("--score-only")) await askPending(golds, profiles, cache, concurrency);

  const sentiments = await loadSonnetSentiments(golds);
  const rows: Scored[] = golds.flatMap((gold) => {
    const cached = cache.get(keyOf(gold.companyId, gold.link));
    if (!cached?.answers) return [];
    const item = toNewsItem(gold);
    const { context } = buildArticleRequest(profiles.get(gold.companyId)!, item);
    return [{ gold, analysis: interpretAnswers(item, context, cached.answers), sonnetSentiment: sentiments.get(`${gold.runId}|${gold.link}`) ?? null }];
  });

  const answered = [...cache.values()].filter((row) => row.answers);
  const latencies = answered.map((row) => row.ms ?? 0).sort((a, b) => a - b);
  const tokens = answered.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0);
  console.log(`\n=== Jev ${answered[0]?.model ?? "?"} · 채점 ${rows.length}/${golds.length}건 ===`);
  console.log(`  요청 p50 ${latencies[latencies.length >> 1]}ms · p95 ${latencies[Math.floor(latencies.length * 0.95)]}ms · 입력 ${tokens.toLocaleString()} 토큰`);

  reportAgainstSonnet(rows);
  await reportAgainstHumans(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
