import { describe, it, expect } from "vitest";
import { diceSimilarity, countOccurrences } from "@/lib/services/textSimilarity";

describe("diceSimilarity", () => {
  it("treats the same headline written with different spacing as identical", () => {
    expect(diceSimilarity("넷록스, 시리즈A 투자 유치", "넷록스 시리즈A 투자유치")).toBeGreaterThan(0.9);
  });

  it("separates unrelated headlines", () => {
    expect(diceSimilarity("넷록스 시리즈A 투자 유치", "삼성전자 반도체 실적 급증")).toBeLessThan(0.2);
  });

  it("scores identical text as 1", () => {
    expect(diceSimilarity("크립토랩 수상", "크립토랩 수상")).toBe(1);
  });

  it("scores 0 when either side has no bigram", () => {
    expect(diceSimilarity("", "크립토랩")).toBe(0);
    expect(diceSimilarity("가", "크립토랩")).toBe(0);
  });

  it("ignores punctuation so quoted titles still match", () => {
    expect(diceSimilarity("'실버 팰리스' 출시", "실버 팰리스 출시")).toBe(1);
  });
});

describe("countOccurrences", () => {
  it("counts every mention of a company name in the body", () => {
    expect(countOccurrences("넷록스는 넷록스답게 넷록스를 만든다", "넷록스")).toBe(3);
  });

  it("returns 0 when the name never appears", () => {
    expect(countOccurrences("삼성전자 실적 발표", "넷록스")).toBe(0);
  });

  it("does not break on regex characters in a company name", () => {
    expect(countOccurrences("(주)크립토랩 수상, (주)크립토랩 투자", "(주)크립토랩")).toBe(2);
  });
});
