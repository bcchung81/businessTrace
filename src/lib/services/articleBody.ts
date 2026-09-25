import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { JSDOM } from "jsdom";
import type { FetchDeps, NewsItem } from "@/lib/services/newsTypes";
import { resolvePublicUrl, systemLookup } from "@/lib/services/outboundUrl";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const GOOGLE_HOST = "news.google.com";
const BATCHEXECUTE = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
const REQUEST_TIMEOUT_MS = 8000;
const MIN_BODY_LENGTH = 100;
const MAX_BODY_LENGTH = 4000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function googleToken(link: string) {
  if (!link.includes(GOOGLE_HOST)) return null;
  const match = /\/(?:articles|read)\/([^/?#]+)/.exec(link);
  return match ? match[1] : null;
}

function decodeLegacyToken(token: string) {
  const candidates = [token, token.replace(/-/g, "+").replace(/_/g, "/")];
  for (const candidate of candidates) {
    try {
      const padded = candidate + "=".repeat((4 - (candidate.length % 4)) % 4);
      const raw = Buffer.from(padded, "base64").toString("binary");
      const url = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/.exec(raw);
      if (url && !url[0].includes(GOOGLE_HOST)) return url[0];
    } catch {
      continue;
    }
  }
  return null;
}

function batchexecutePayload(token: string, timestamp: string, signature: string) {
  const request = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["ko", "KR"], null, null, 1, 1, "KR:ko", null, 180, null, null, null, null, null, 0, null, null, [1765, 1000]],
      "ko",
      "KR",
      1,
      [2, 3, 4, 8],
      1,
      0,
      "655000234",
      0,
      0,
      null,
      0,
    ],
    token,
    Number(timestamp),
    signature,
  ]);
  return JSON.stringify([[["Fbv4je", request, null, "generic"]]]);
}

function readBatchexecuteUrl(body: string) {
  const outer: unknown = JSON.parse(body.replace(/^\)\]\}'\n?/, ""));
  if (!Array.isArray(outer)) return null;

  const frame = outer.find(
    (entry): entry is unknown[] =>
      Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === "Fbv4je",
  );
  if (!frame || typeof frame[2] !== "string") return null;

  const inner: unknown = JSON.parse(frame[2]);
  if (!Array.isArray(inner) || inner[0] !== "garturlres") return null;

  const url = inner[1];
  return typeof url === "string" && !url.includes(GOOGLE_HOST) ? url : null;
}

/**
 * 구글 뉴스 링크를 원문 언론사 URL 로 복원한다.
 * 2024년 이후 토큰은 base64 가 아니라 batchexecute 호출이 필요하다.
 */
export async function resolveGoogleNewsUrl(link: string, deps: FetchDeps = {}) {
  const token = googleToken(link);
  if (!token) return link;

  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const page = await fetchImpl(`https://news.google.com/rss/articles/${token}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (page.ok) {
      const anchor = cheerio.load(await page.text())("[data-n-a-sg]").first();
      const signature = anchor.attr("data-n-a-sg");
      const timestamp = anchor.attr("data-n-a-ts");
      if (signature && timestamp) {
        const posted = await fetchImpl(BATCHEXECUTE, {
          method: "POST",
          headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({
            "f.req": batchexecutePayload(token, timestamp, signature),
          }).toString(),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (posted.ok) {
          const resolved = readBatchexecuteUrl(await posted.text());
          if (resolved) return resolved;
        }
      }
    }
  } catch {
    return decodeLegacyToken(token) ?? link;
  }

  return decodeLegacyToken(token) ?? link;
}

function decodeHtml(buffer: Buffer, contentType: string | null) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const fromMeta = /charset=["']?([\w-]+)/i.exec(buffer.subarray(0, 4096).toString("latin1"))?.[1];
  const charset = (fromHeader ?? fromMeta ?? "").toLowerCase();
  const encoding = /euc-?kr|cp949|ks_c_5601/.test(charset) ? "euc-kr" : "utf-8";
  return iconv.decode(buffer, encoding);
}

type DomFactory = { createDom?: (html: string, url: string) => { window: { document: Document; close: () => void } } };

/**
 * 페이지에서 본문 텍스트만 뽑는다.
 * 파싱 창은 반드시 닫는다 — 기사 100건을 병렬로 훑으므로, 안 닫으면 문서 트리가 그만큼 메모리에 남는다.
 */
export function extractReadableText(html: string, url: string, deps: DomFactory = {}) {
  const dom = (deps.createDom ?? ((source, at) => new JSDOM(source, { url: at })))(html, url);

  try {
    const document = dom.window.document;
    const parsed = new Readability(document).parse();
    if (!parsed?.content) return normaliseLines(parsed?.textContent ?? "");
    const container = document.createElement("div");
    container.innerHTML = parsed.content;
    for (const block of container.querySelectorAll(BLOCK_SELECTOR)) {
      block.before(document.createTextNode("\n"));
      block.after(document.createTextNode("\n"));
    }
    return normaliseLines(container.textContent ?? "");
  } finally {
    dom.window.close();
  }
}

const BLOCK_SELECTOR = "p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, section, article, header, footer, tr, dd, dt, pre, table";

/**
 * 줄 안의 공백은 하나로 접고 블록 경계의 줄바꿈은 하나만 남긴다.
 * 블록을 공백 없이 붙이면 "자금 조달" 소제목과 "바이오바이츠가" 가 한 단어가 된다 — 기업명 경계 판정과 문장 분리가 함께 틀린다.
 */
function normaliseLines(text: string) {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

const FOOTER_MARKERS = ["등록번호", "등록일자", "발행인", "편집인", "제호", "사업자등록번호", "청소년보호책임자", "정보보호책임자", "고충처리인", "대표전화", "개인정보", "Copyright"];

/**
 * 본문 대신 사이트 푸터를 긁은 텍스트인지 가른다 — 발행 정보 표지가 넷 이상이고 기사라 보기엔 짧으면 푸터다.
 * 푸터를 본문으로 넘기면 모델은 제목만 보고 판정한다. 버리면 수집기가 검색 요약문을 대신 쓴다.
 */
export function isBoilerplateBody(text: string) {
  const markers = FOOTER_MARKERS.filter((marker) => text.includes(marker)).length;
  return markers >= 4 && text.length < 1500;
}

/**
 * 링크에서 utm_*·fbclid 추적 파라미터만 걷어낸다.
 * 같은 기사가 네이버·구글에서 다른 문자열로 들어와도 URL 이 한 키로 모이게 한다.
 */
function stripTrackingParams(link: string) {
  try {
    const url = new URL(link);
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "fbclid") url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return link;
  }
}

/**
 * 기사 본문을 크롤링해 정제된 텍스트로 돌려준다.
 * 실패하면 예외 대신 빈 문자열을 준다. 본문 없음은 수집 실패가 아니다.
 */
export async function fetchArticleBody(url: string, deps: FetchDeps & DomFactory = {}) {
  const resolved = await resolveGoogleNewsUrl(url, deps);
  if (resolved.includes(GOOGLE_HOST)) return "";
  return fetchBodyFromUrl(resolved, deps);
}

/**
 * 응답 본문을 상한까지만 읽고, 넘으면 버린다.
 * 선언된 길이를 믿지 않고 스트림을 세면서 끊는다 — 헤더 없이 계속 보내는 서버가 OOM 을 만든다.
 */
async function readCapped(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return null;

  const stream = response.body;
  if (!stream) {
    const whole = Buffer.from(await response.arrayBuffer());
    return whole.length > MAX_RESPONSE_BYTES ? null : whole;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * 리다이렉트를 직접 걸으면서 홉마다 대상 주소를 다시 검사한다.
 * `redirect: "follow"` 로 두면 첫 홉만 검사한 셈이라, 뉴스 색인의 한 페이지가 302 로 내부망을 부를 수 있다.
 */
async function fetchGuarded(start: string, deps: FetchDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? systemLookup;

  let target = await resolvePublicUrl(start, lookup);
  for (let hop = 0; target && hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(target.href, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
    if (response.status < 300 || response.status >= 400) {
      return response.ok ? { response, href: target.href } : null;
    }
    const location = response.headers.get("location");
    target = location ? await resolvePublicUrl(new URL(location, target).href, lookup) : null;
  }
  return null;
}

async function fetchBodyFromUrl(resolved: string, deps: FetchDeps & DomFactory = {}) {
  try {
    const hop = await fetchGuarded(resolved, deps);
    if (!hop) return "";

    const raw = await readCapped(hop.response);
    if (!raw) return "";
    const html = decodeHtml(raw, hop.response.headers.get("content-type"));

    const article = extractReadableText(html, hop.href, deps);
    if (article.length >= MIN_BODY_LENGTH && !isBoilerplateBody(article)) return article.slice(0, MAX_BODY_LENGTH);

    const naverBody = cheerio.load(html)("#dic_area").text().replace(/\s+/g, " ").trim();
    if (naverBody.length >= MIN_BODY_LENGTH && !isBoilerplateBody(naverBody)) return naverBody.slice(0, MAX_BODY_LENGTH);

    return "";
  } catch {
    return "";
  }
}

/**
 * 뉴스 목록의 본문을 병렬로 채운다.
 * 크롤링에 실패한 항목은 원래 요약을 유지한다.
 */
export async function enrichWithBodies(
  items: NewsItem[],
  deps: FetchDeps & DomFactory & { concurrency?: number } = {},
) {
  const enriched = new Array<NewsItem>(items.length);
  const concurrency = Math.max(1, deps.concurrency ?? 4);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        const link = stripTrackingParams(await resolveGoogleNewsUrl(item.link, deps));
        const body = link.includes(GOOGLE_HOST) ? "" : await fetchBodyFromUrl(link, deps);
        enriched[index] = {
          ...item,
          link,
          content: body.length > item.description.length ? body : item.description,
        };
      }
    }),
  );

  return enriched;
}
