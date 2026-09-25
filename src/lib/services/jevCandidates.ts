import { countCompanyMentions } from "@/lib/services/textSimilarity";

const MIN_SENTENCE_LENGTH = 4;
const MAX_SENTENCE_LENGTH = 400;
const WINDOW_CAP = 12;
const SUMMARY_CAP = 15;
const CANDIDATE_CAP = 30;

/**
 * 기사 본문을 문장으로 나눈다. 줄바꿈과 문장부호 뒤 공백에서 끊는다 — "3.5%" 같은 소수점은 끊지 않는다.
 */
export function splitSentences(text: string): string[] {
  const seen = new Set<string>();
  const sentences: string[] = [];
  for (const line of text.split(/\n+/)) {
    for (const raw of line.split(/(?<=[.!?])\s+/)) {
      const sentence = raw.trim();
      if (sentence.length < MIN_SENTENCE_LENGTH || seen.has(sentence)) continue;
      seen.add(sentence);
      sentences.push(sentence);
    }
  }
  return sentences;
}

/**
 * 회사명·별칭이 든 문장과 앞뒤 한 문장을 원래 순서대로 고른다. 넘치면 회사명이 든 문장을 먼저 남긴다.
 * 긴 기사에서 판단 근거를 좁혀 준다 — Jev 는 한국어 정확도가 낮다고 스스로 밝힌다.
 */
export function mentionWindow(sentences: string[], names: string[], radius = 1) {
  const mentions = sentences.flatMap((sentence, index) => (names.some((name) => name && countCompanyMentions(sentence, name) > 0) ? [index] : []));
  const picked = new Set<number>(mentions.slice(0, WINDOW_CAP));
  for (const index of mentions) {
    for (let offset = -radius; offset <= radius; offset += 1) {
      const neighbour = index + offset;
      if (picked.size >= WINDOW_CAP) break;
      if (neighbour >= 0 && neighbour < sentences.length) picked.add(neighbour);
    }
  }
  const order = [...picked].sort((a, b) => a - b);
  return { mentions, sentences: order.map((index) => sentences[index]) };
}

const AMOUNT = /\d[\d,.]*\s*(?:조\s*(?:\d[\d,.]*\s*)?)?(?:억\s*(?:\d[\d,.]*\s*)?)?(?:만\s*)?원/g;

function unique(values: string[], cap = CANDIDATE_CAP) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 2))].slice(0, cap);
}

/**
 * 기사에 적힌 원화 금액을 적힌 모양 그대로 모두 모은다. 일부러 넉넉히 모은다 — Jev 는 후보에 없는 값을 고를 수 없다.
 */
export function amountCandidates(text: string): string[] {
  return unique(text.match(AMOUNT) ?? []);
}

/**
 * "1조2000억원"·"21억 원"·"1,500만원" 을 원 단위 정수로 바꾼다. 금액이 아니면 null.
 */
export function parseKrw(span: string): number | null {
  const compact = span.replace(/[\s,]/g, "");
  const match = /^(?:(\d+(?:\.\d+)?)조)?(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(\d+(?:\.\d+)?)?원$/.exec(compact);
  if (!match || match.slice(1).every((part) => part === undefined)) return null;
  const [, jo, eok, man, rest] = match.map((part) => Number(part ?? 0));
  return Math.round(jo * 1e12 + eok * 1e8 + man * 1e4 + rest);
}

const AWARD_WORD = /(?:장관상|대통령상|총리상|청장상|위원장상|시장상|지사상|대상|최우수상|우수상|금상|은상|동상|혁신상|공로상|표창|어워드|Awards?)$/;
const QUOTED = /['‘"“「『《]([^'’"”」』》]{2,40})['’"”」』》]/g;
const AWARD_PHRASE = /(?:[가-힣A-Za-z0-9·]+\s){0,3}[가-힣A-Za-z0-9·]*(?:장관상|대통령상|총리상|청장상|위원장상|시장상|지사상|대상|최우수상|우수상|금상|은상|동상|혁신상|공로상|표창|어워드|Awards?)/g;

/**
 * 수상명 후보를 모은다 — 따옴표 안의 상 이름과 "…장관상"·"…어워드" 로 끝나는 구절.
 */
export function awardCandidates(text: string): string[] {
  const quoted = [...text.matchAll(QUOTED)].map((match) => match[1].trim()).filter((value) => AWARD_WORD.test(value));
  return unique([...quoted, ...(text.match(AWARD_PHRASE) ?? [])]);
}

/**
 * 요약 후보 문장 — 리드 세 문장을 먼저, 이어서 회사명이 든 문장. 너무 긴 문장은 뺀다.
 */
export function summaryCandidates(sentences: string[], mentions: number[]): string[] {
  const ordered = [...sentences.slice(0, 3), ...mentions.map((index) => sentences[index])];
  return unique(ordered.filter((sentence) => sentence && sentence.length <= MAX_SENTENCE_LENGTH), SUMMARY_CAP);
}
