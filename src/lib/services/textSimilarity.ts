function bigrams(text: string) {
  const normalised = text.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
  const grams = new Set<string>();
  for (let i = 0; i < normalised.length - 1; i += 1) {
    grams.add(normalised.slice(i, i + 2));
  }
  return grams;
}

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
