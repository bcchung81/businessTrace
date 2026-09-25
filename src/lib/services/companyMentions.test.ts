import { describe, it, expect } from "vitest";
import { countCompanyMentions, firstMentionIndex } from "@/lib/services/textSimilarity";

describe("countCompanyMentions", () => {
  it("counts a plain occurrence", () => {
    expect(countCompanyMentions("크립토랩이 투자를 유치했다. 크립토랩은", "크립토랩")).toBe(2);
  });

  it("finds a name the article writes without the space the registry keeps", () => {
    expect(countCompanyMentions("코난테크놀로지가 계약을 맺었다.", "코난 테크놀로지")).toBe(1);
  });

  it("finds a name the article spaces differently from the registry", () => {
    expect(countCompanyMentions("아주대학교 산학협력단과 아주대학교산학협력단", "아주대학교산학협력단")).toBe(2);
  });

  it("keeps a two letter name exact, so it cannot span a word boundary", () => {
    expect(countCompanyMentions("가나다 라마바", "다라")).toBe(0);
    expect(countCompanyMentions("다라마 회사", "다라")).toBe(1);
  });

  it("does not match text that simply does not contain the name", () => {
    expect(countCompanyMentions("가나다 마바", "코난 테크놀로지")).toBe(0);
  });

  it("counts nothing for an empty name", () => {
    expect(countCompanyMentions("아무 글", "")).toBe(0);
  });

  it("treats a name with regex characters as plain text", () => {
    expect(countCompanyMentions("(주)에이(비) 소개", "(주)에이(비)")).toBe(1);
  });

  it("does not count a short name that is the tail of a longer word", () => {
    expect(countCompanyMentions("글로벌 뷰티 브랜드 아누아(Anua)가 출시했다", "누아")).toBe(0);
    expect(countCompanyMentions("르페어리, 10억 투자 유치", "페어리")).toBe(0);
    expect(countCompanyMentions("HSDT 규격", "SDT")).toBe(0);
  });

  it("still counts a long name glued to the previous block by body extraction", () => {
    expect(countCompanyMentions("21억원 자금 조달바이오바이츠가 21억 원을", "바이오바이츠")).toBe(1);
  });

  it("still counts a name after punctuation or a corporate prefix", () => {
    expect(countCompanyMentions("㈜누아가 '누아' (주)누아 주식회사 누아 주식회사누아", "누아")).toBe(5);
  });
});

describe("firstMentionIndex", () => {
  it("skips a name embedded in a longer word", () => {
    expect(firstMentionIndex("아누아와 누아", "누아")).toBe(5);
  });
});
