import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { JSDOM } from "jsdom";
import type { FetchDeps, NewsItem } from "@/lib/services/newsTypes";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const GOOGLE_HOST = "news.google.com";
const BATCHEXECUTE = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
const REQUEST_TIMEOUT_MS = 8000;
const MIN_BODY_LENGTH = 100;
const MAX_BODY_LENGTH = 4000;

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
    // 구글이 막히면 구형 토큰 폴백으로 넘어간다.
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

export async function fetchArticleBody(url: string, deps: FetchDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolved = await resolveGoogleNewsUrl(url, deps);
  if (resolved.includes(GOOGLE_HOST)) return "";

  try {
    const response = await fetchImpl(resolved, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return "";

    const html = decodeHtml(Buffer.from(await response.arrayBuffer()), response.headers.get("content-type"));

    const parsed = new Readability(new JSDOM(html, { url: resolved }).window.document).parse();
    const article = (parsed?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (article.length >= MIN_BODY_LENGTH) return article.slice(0, MAX_BODY_LENGTH);

    const naverBody = cheerio.load(html)("#dic_area").text().replace(/\s+/g, " ").trim();
    if (naverBody.length >= MIN_BODY_LENGTH) return naverBody.slice(0, MAX_BODY_LENGTH);

    return "";
  } catch {
    return "";
  }
}

export async function enrichWithBodies(
  items: NewsItem[],
  deps: FetchDeps & { concurrency?: number } = {},
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
        const body = await fetchArticleBody(item.link, deps);
        enriched[index] = {
          ...item,
          content: body.length > item.description.length ? body : item.description,
        };
      }
    }),
  );

  return enriched;
}
