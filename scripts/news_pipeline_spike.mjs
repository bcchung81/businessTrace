import "dotenv/config";
import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const NAVER_HUB = "https://naverapihub.apigw.ntruss.com/search/v1/news";

class NewsRateLimitError extends Error {}
const naverFiltered = { count: 0 };

function stripHtml(s) {
  return (s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}

function pressNameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "알 수 없음";
  }
}

async function fetchNaver(query, { maxResults = 1000, startDate, fetchImpl = fetch } = {}) {
  const items = [];
  let start = 1;
  const display = 100;
  const startTs = startDate ? new Date(startDate).getTime() : null;
  while (items.length < maxResults && start <= 1000) {
    const url = new URL(NAVER_HUB);
    url.searchParams.set("query", `"${query}"`);
    url.searchParams.set("display", String(display));
    url.searchParams.set("start", String(start));
    url.searchParams.set("sort", "date");
    const res = await fetchImpl(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": process.env.NCP_APIGW_API_KEY_ID ?? "",
        "X-NCP-APIGW-API-KEY": process.env.NCP_APIGW_API_KEY ?? "",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) throw new NewsRateLimitError("naver rate limit exceeded");
    if (!res.ok) throw new Error(`naver ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const body = await res.json();
    const page = body.items ?? [];
    if (page.length === 0) break;
    const q = query.toLowerCase();
    for (const it of page) {
      const link = it.originallink || it.link;
      if (!(stripHtml(it.title).toLowerCase().includes(q) || stripHtml(it.description).toLowerCase().includes(q))) { naverFiltered.count++; continue; }
      items.push({
        title: stripHtml(it.title),
        link,
        description: stripHtml(it.description),
        content: stripHtml(it.description),
        published: new Date(it.pubDate).toISOString(),
        source: pressNameFromUrl(link),
        provider: "naver",
      });
    }
    const oldest = new Date(page.at(-1).pubDate).getTime();
    if (startTs && oldest < startTs) break;
    if (page.length < display) break;
    start += display;
  }
  return items;
}

async function fetchGoogle(query, { fetchImpl = fetch } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}"`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const feed = await new Parser({ customFields: { item: [["source", "sourceRaw"]] } }).parseString(await res.text());
  return feed.items.map((it) => ({
    title: stripHtml(it.title ?? "").replace(/\s-\s[^-]+$/, ""),
    link: it.link ?? "",
    description: stripHtml(it.contentSnippet ?? it.content ?? ""),
    content: stripHtml(it.contentSnippet ?? it.content ?? ""),
    published: it.isoDate ?? new Date(it.pubDate ?? Date.now()).toISOString(),
    source: typeof it.sourceRaw === "object" ? (it.sourceRaw?._ ?? "Google News") : (it.sourceRaw ?? "Google News"),
    provider: "google",
  }));
}

function bigrams(s) {
  const norm = s.replace(/[\s\p{P}]/gu, "").toLowerCase();
  const set = new Set();
  for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2));
  return set;
}

function titleSimilarity(a, b) {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return (2 * inter) / (x.size + y.size);
}

function removeDuplicates(items, threshold) {
  if (threshold <= 0) return { items, removed: 0 };
  const kept = [];
  let removed = 0;
  for (const item of items) {
    if (kept.some((k) => titleSimilarity(k.title, item.title) >= threshold)) removed++;
    else kept.push(item);
  }
  return { items: kept, removed };
}

const googleStats = { total: 0, batchexecute: 0, base64: 0, failed: 0 };

function base64Decode(token) {
  for (const variant of [token, token.replace(/-/g, "+").replace(/_/g, "/"), token + "=".repeat((4 - (token.length % 4)) % 4)]) {
    try {
      const raw = Buffer.from(variant, "base64").toString("binary");
      const m = /https?:\/\/[^\s\x00-\x1f"'\\]+/.exec(raw);
      if (m) return m[0];
    } catch { /* next */ }
  }
  return null;
}

async function resolveGoogleNewsUrl(link, { fetchImpl = fetch } = {}) {
  if (!/news\.google\.com\/(rss\/)?(articles|read)\//.test(link)) return link;
  googleStats.total++;
  const token = link.split(/\/(?:articles|read)\//)[1]?.split("?")[0];
  if (!token) { googleStats.failed++; return link; }

  try {
    const res = await fetchImpl(`https://news.google.com/rss/articles/${token}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    const $ = cheerio.load(await res.text());
    const el = $("[data-n-a-sg]").first();
    const signature = el.attr("data-n-a-sg");
    const timestamp = el.attr("data-n-a-ts");
    if (signature && timestamp) {
      const payload = JSON.stringify([[["Fbv4je", JSON.stringify(["garturlreq", [["X", "X", ["ko", "KR"], null, null, 1, 1, "KR:ko", null, 180, null, null, null, null, null, 0, null, null, [1765, 1000]], "ko", "KR", 1, [2, 3, 4, 8], 1, 0, "655000234", 0, 0, null, 0], token, Number(timestamp), signature]), null, "generic"]]]);
      const post = await fetchImpl("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ "f.req": payload }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      const text = await post.text();
      const outer = JSON.parse(text.replace(/^\)\]\}'\n?/, ""));
      const frame = outer.find((f) => f[0] === "wrb.fr" && f[1] === "Fbv4je");
      const inner = frame ? JSON.parse(frame[2]) : null;
      if (inner?.[0] === "garturlres" && typeof inner[1] === "string" && !inner[1].includes("news.google.com")) {
        googleStats.batchexecute++;
        return inner[1];
      }
    }
  } catch { /* fall through */ }

  const legacy = base64Decode(token);
  if (legacy && !legacy.includes("news.google.com")) { googleStats.base64++; return legacy; }
  googleStats.failed++;
  return link;
}

function decodeBody(buf, contentType) {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase();
  if (!charset) charset = /charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString("latin1"))?.[1]?.toLowerCase();
  const enc = charset && /euc-?kr|cp949|ks_c_5601/.test(charset) ? "euc-kr" : "utf-8";
  return { text: iconv.decode(buf, enc), charset: charset ?? "none" };
}

const bodyStats = { attempted: 0, readability: 0, dicArea: 0, failed: 0, charsets: {}, errors: {} };

async function fetchArticleBody(url, { fetchImpl = fetch } = {}) {
  const resolved = await resolveGoogleNewsUrl(url, { fetchImpl });
  if (/news\.google\.com/.test(resolved)) { bodyStats.failed++; bodyStats.errors["google-unresolved"] = (bodyStats.errors["google-unresolved"] ?? 0) + 1; return ""; }
  bodyStats.attempted++;
  try {
    const res = await fetchImpl(resolved, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!res.ok) { bodyStats.failed++; bodyStats.errors[`http-${res.status}`] = (bodyStats.errors[`http-${res.status}`] ?? 0) + 1; return ""; }
    const { text: html, charset } = decodeBody(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type"));
    bodyStats.charsets[charset] = (bodyStats.charsets[charset] ?? 0) + 1;
    const parsed = new Readability(new JSDOM(html, { url: resolved }).window.document).parse();
    let body = (parsed?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (body.length >= 100) { bodyStats.readability++; return body.slice(0, 4000); }
    const $ = cheerio.load(html);
    body = $("#dic_area").text().replace(/\s+/g, " ").trim();
    if (body.length >= 100) { bodyStats.dicArea++; return body.slice(0, 4000); }
    bodyStats.failed++; bodyStats.errors["too-short"] = (bodyStats.errors["too-short"] ?? 0) + 1;
    return "";
  } catch (e) {
    bodyStats.failed++;
    const key = e.name === "TimeoutError" ? "timeout" : (e.cause?.code ?? e.name);
    bodyStats.errors[key] = (bodyStats.errors[key] ?? 0) + 1;
    return "";
  }
}

async function enrichWithBodies(items, { concurrency = 4 } = {}) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      const body = await fetchArticleBody(item.link);
      out[i] = { ...item, content: body.length > item.description.length ? body : item.description, bodyOk: body.length >= 100 };
    }
  }));
  return out;
}

async function collectNews({ query, startDate, limit = 30, duplicateThreshold = 0.5 }) {
  const [naver, google] = await Promise.allSettled([fetchNaver(query, { startDate }), fetchGoogle(query)]);
  const errs = [];
  const naverItems = naver.status === "fulfilled" ? naver.value : (errs.push(`naver: ${naver.reason.message}`), []);
  const googleItems = google.status === "fulfilled" ? google.value : (errs.push(`google: ${google.reason.message}`), []);
  let merged = [...naverItems, ...googleItems];
  if (startDate) {
    const ts = new Date(startDate).getTime();
    merged = merged.filter((i) => new Date(i.published).getTime() >= ts);
  }
  const { items: deduped, removed } = removeDuplicates(merged, duplicateThreshold);
  deduped.sort((a, b) => new Date(b.published) - new Date(a.published));
  const capped = deduped.slice(0, limit);
  const enriched = await enrichWithBodies(capped);
  return { naverRaw: naverItems.length, googleRaw: googleItems.length, afterPeriod: merged.length, removed, capped: capped.length, items: enriched, errs };
}

const COMPANIES = process.argv.slice(2).length ? process.argv.slice(2) : ["크립토랩", "올림플래닛", "넷록스", "페어리", "논스랩"];
const START = "2024-01-01";
const summary = [];
const dump = {};

for (const name of COMPANIES) {
  const t0 = Date.now();
  try {
    const r = await collectNews({ query: name, startDate: START, limit: 30 });
    const ok = r.items.filter((i) => i.bodyOk);
    summary.push({
      기업: name, 네이버: r.naverRaw, 구글: r.googleRaw, 기간후: r.afterPeriod, 중복제거: r.removed,
      분석대상: r.capped, 본문확보: ok.length,
      본문률: r.capped ? `${Math.round((ok.length / r.capped) * 100)}%` : "-",
      평균본문: ok.length ? Math.round(ok.reduce((s, i) => s + i.content.length, 0) / ok.length) : 0,
      초: ((Date.now() - t0) / 1000).toFixed(1),
      오류: r.errs.join("; ") || "-",
    });
    dump[name] = r.items.map((i) => ({ provider: i.provider, source: i.source, published: i.published.slice(0, 10), title: i.title, link: i.link, bodyOk: i.bodyOk, len: i.content.length, head: i.content.slice(0, 120) }));
  } catch (e) {
    summary.push({ 기업: name, 네이버: "-", 구글: "-", 기간후: "-", 중복제거: "-", 분석대상: "-", 본문확보: "-", 본문률: "ERR", 평균본문: 0, 초: ((Date.now() - t0) / 1000).toFixed(1), 오류: e.message.slice(0, 60) });
  }
}

console.table(summary);
console.log("네이버 제목·요약 필터로 제외:", naverFiltered.count);
console.log("\n구글 링크 복원:", googleStats);
console.log("본문 추출:", { ...bodyStats, charsets: bodyStats.charsets, errors: bodyStats.errors });
writeFileSync(new URL("./pipeline-result.json", import.meta.url), JSON.stringify({ summary, googleStats, bodyStats, dump }, null, 2));
console.log("\n상세 → pipeline-result.json");

// 실행: npm i @mozilla/readability jsdom iconv-lite cheerio rss-parser dotenv 후
//       node scripts/news_pipeline_spike.mjs
// 2026-08-27 실측 결과는 docs/superpowers/plans/2026-08-26-phase0-core-loop.md Task 7 참조
