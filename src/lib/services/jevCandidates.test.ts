import { describe, expect, it } from "vitest";
import {
  amountCandidates,
  awardCandidates,
  mentionWindow,
  parseKrw,
  splitSentences,
  summaryCandidates,
} from "@/lib/services/jevCandidates";

const BODY = [
  "동형암호 기업 크립토랩이 200억원 규모의 시리즈B 투자를 유치했다고 28일 밝혔다.",
  "이번 투자에는 기존 투자사 3곳이 참여했으며 누적 투자금은 1조2000억원이 아니라 350억원이다.",
  "회사는 올해 매출이 전년보다 3.5% 늘었다.",
  "한편 업계에서는 암호 기술 수요가 커지고 있다.",
  "크립토랩은 '2026 대한민국 혁신기업 대상'을 받았고, 과기정통부 장관상도 수상했다.",
].join(" ");

describe("splitSentences", () => {
  it("splits on sentence endings and line breaks but not inside decimals", () => {
    const sentences = splitSentences(`제목 줄\n${BODY}`);
    expect(sentences[0]).toBe("제목 줄");
    expect(sentences).toContain("회사는 올해 매출이 전년보다 3.5% 늘었다.");
    expect(sentences).toHaveLength(6);
  });

  it("drops fragments too short to carry a fact", () => {
    expect(splitSentences("가. 크립토랩이 투자를 유치했다.")).toEqual(["크립토랩이 투자를 유치했다."]);
  });
});

describe("mentionWindow", () => {
  it("keeps sentences naming the company plus one neighbour on each side, in order", () => {
    const sentences = splitSentences(BODY);
    const window = mentionWindow(sentences, ["크립토랩"]);
    expect(window.mentions).toEqual([0, 4]);
    expect(window.sentences).toEqual([sentences[0], sentences[1], sentences[3], sentences[4]]);
  });

  it("matches an alias as well as the name", () => {
    const window = mentionWindow(["CryptoLab 이 투자를 받았다.", "무관한 문장이다."], ["크립토랩", "CryptoLab"]);
    expect(window.mentions).toEqual([0]);
  });
});

describe("amountCandidates", () => {
  it("over-collects every won amount as written in the article", () => {
    expect(amountCandidates(BODY)).toEqual(["200억원", "1조2000억원", "350억원"]);
  });

  it("reads spaced and comma forms", () => {
    expect(amountCandidates("21억 원을 조달했다. 1,500만원을 받았다. 3,000,000원이다.")).toEqual(["21억 원", "1,500만원", "3,000,000원"]);
  });
});

describe("parseKrw", () => {
  it("converts Korean units to won", () => {
    expect(parseKrw("200억원")).toBe(20_000_000_000);
    expect(parseKrw("1조2000억원")).toBe(1_200_000_000_000);
    expect(parseKrw("1.5억 원")).toBe(150_000_000);
    expect(parseKrw("1,500만원")).toBe(15_000_000);
    expect(parseKrw("3,000,000원")).toBe(3_000_000);
  });

  it("returns null for text that is not an amount", () => {
    expect(parseKrw("원")).toBeNull();
  });
});

describe("awardCandidates", () => {
  it("collects quoted award names and phrases ending in an award word", () => {
    const candidates = awardCandidates(BODY);
    expect(candidates).toContain("2026 대한민국 혁신기업 대상");
    expect(candidates.some((candidate) => candidate.endsWith("장관상"))).toBe(true);
  });

  it("returns nothing for an article without award words", () => {
    expect(awardCandidates("크립토랩이 투자를 유치했다.")).toEqual([]);
  });
});

describe("summaryCandidates", () => {
  it("offers the lead sentences first, then the company's sentences, without repeats", () => {
    const sentences = splitSentences(BODY);
    const candidates = summaryCandidates(sentences, [0, 4]);
    expect(candidates.slice(0, 3)).toEqual(sentences.slice(0, 3));
    expect(candidates).toContain(sentences[4]);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
