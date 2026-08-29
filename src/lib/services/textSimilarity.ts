function bigrams(text: string) {
  const normalised = text.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i < normalised.length - 1; i += 1) {
    grams.add(normalised.slice(i, i + 2));
  }
  return grams;
}

/**
 * 두 문자열의 문자 bigram Dice 계수를 낸다.
 * 띄어쓰기·구두점을 지우므로 같은 내용을 다르게 적은 제목이 같게 잡힌다.
 */
export function diceSimilarity(a: string, b: string) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const gram of left) {
    if (right.has(gram)) shared += 1;
  }
  return (2 * shared) / (left.size + right.size);
}

/**
 * 문자열 안에서 특정 단어가 몇 번 나오는지 센다.
 * 정규식을 쓰지 않아 회사명에 괄호가 있어도 안전하다.
 */
export function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;

  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

const FLEXIBLE_MIN_LENGTH = 3;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 기사에서 기업명이 몇 번 나오는지 센다. 띄어쓰기 차이를 무시한다.
 * 명단은 "코난 테크놀로지", 기사는 "코난테크놀로지"로 쓴다 - 그대로 세면 주제 기사가 0건이 된다.
 * 두 글자 이름은 어절을 건너뛰어 오탐할 수 있어 정확 일치만 센다.
 */
export function countCompanyMentions(haystack: string, needle: string) {
  const compact = (needle ?? "").replace(/\s+/g, "");
  if (compact.length === 0) return 0;

  const pattern =
    compact.length < FLEXIBLE_MIN_LENGTH
      ? escapeRegExp(compact)
      : [...compact].map(escapeRegExp).join("\\s*");

  return (haystack ?? "").match(new RegExp(pattern, "g"))?.length ?? 0;
}
