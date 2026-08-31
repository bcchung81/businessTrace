import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { closeResolvedConflictEvents, upsertEvents, listEvents, latestEventAt, mergeDuplicateEvents, reviewEvent, summariseEvents } from "@/lib/repositories/eventRepository";
import type { NewEvent } from "@/lib/services/eventRules";

describe("Event schema", () => {
  beforeEach(resetDatabase);

  it("stores one event per company, kind and evidence key", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const data = {
      companyId: company.id, kind: "award", severity: "positive", occurredAt: new Date("2026-08-26"),
      title: "식약처 허가", evidenceKey: "https://n/1", evidenceJson: "[]",
    };
    await prisma.event.create({ data });

    await expect(prisma.event.create({ data })).rejects.toThrow();
    expect(await prisma.event.count()).toBe(1);
  });

  it("defaults status to open and keeps trust nullable", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const saved = await prisma.event.create({
      data: { companyId: company.id, kind: "headcount_down", severity: "notice", occurredAt: new Date(), title: "t", evidenceKey: "202607", evidenceJson: "[]" },
    });

    expect(saved.status).toBe("open");
    expect(saved.trust).toBeNull();
  });
});

function fresh(over: Partial<NewEvent> & { companyId: number }): NewEvent {
  return { kind: "award", severity: "positive", occurredAt: new Date("2026-08-26T00:00:00.000Z"), title: "수상 — 대상", evidenceKey: "https://n/1", evidence: [{ label: "대상", link: "https://n/1" }], runId: null, trust: "verified", ...over };
}

describe("closeResolvedConflictEvents", () => {
  beforeEach(resetDatabase);

  it("closes open namesake-conflict events whose source no longer conflicts, and leaves live ones open", async () => {
    const company = await prisma.company.create({ data: { name: "미타운", year: 2025 } });
    const base = { companyId: company.id, kind: "source_conflict", severity: "notice", occurredAt: new Date(), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, evidenceKey: "fsc:conflict", status: "open" } });
    await prisma.event.create({ data: { ...base, evidenceKey: "dart:conflict", status: "open" } });

    const closed = await closeResolvedConflictEvents(company.id, ["dart:conflict"]);

    const rows = await prisma.event.findMany({ orderBy: { evidenceKey: "asc" } });
    expect(closed).toBe(1);
    expect(rows.map((row) => [row.evidenceKey, row.status])).toEqual([
      ["dart:conflict", "open"],
      ["fsc:conflict", "done"],
    ]);
  });
});

describe("mergeDuplicateEvents", () => {
  beforeEach(resetDatabase);

  it("merges same-title duplicates, keeping the reviewed record under the publisher url key", async () => {
    const company = await prisma.company.create({ data: { name: "한국첨단소재", year: 2025 } });
    const base = { companyId: company.id, kind: "negative_press", severity: "notice", occurredAt: new Date("2026-08-30"), title: "부정 보도 — 유증 흥행에도 씁쓸한 뒷맛" };
    await prisma.event.create({ data: { ...base, evidenceKey: "https://biz.example.kr/a/1", evidenceJson: JSON.stringify([{ label: "기사", link: "https://biz.example.kr/a/1" }]), status: "open" } });
    await prisma.event.create({ data: { ...base, evidenceKey: "https://news.google.com/rss/articles/tok?oc=5", evidenceJson: JSON.stringify([{ label: "기사", link: "https://news.google.com/rss/articles/tok?oc=5" }]), status: "acknowledged", note: "확인 중" } });

    const result = await mergeDuplicateEvents();
    const rows = await prisma.event.findMany();

    expect(result).toEqual({ merged: 1, deleted: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ evidenceKey: "https://biz.example.kr/a/1", status: "acknowledged", note: "확인 중" });
    expect(JSON.parse(rows[0].evidenceJson)[0].link).toBe("https://biz.example.kr/a/1");
  });

  it("clusters similar-title news events within a week into one event with merged evidence", async () => {
    const company = await prisma.company.create({ data: { name: "오토노머스에이투지", year: 2025 } });
    const base = { companyId: company.id, kind: "positive_press", severity: "positive" };
    await prisma.event.create({ data: { ...base, occurredAt: new Date("2026-08-20"), title: "긍정 보도 — 오토노머스에이투지, 중기부 '글로벌 팁스' 선정", evidenceKey: "https://a/1", evidenceJson: JSON.stringify([{ label: "기사1", link: "https://a/1" }]), status: "open" } });
    await prisma.event.create({ data: { ...base, occurredAt: new Date("2026-08-21"), title: "긍정 보도 — 오토노머스에이투지, '글로벌 팁스' 선정…66억 규모 레벨4", evidenceKey: "https://a/2", evidenceJson: JSON.stringify([{ label: "기사2", link: "https://a/2" }]), status: "acknowledged" } });

    const result = await mergeDuplicateEvents();
    const rows = await prisma.event.findMany();

    expect(result).toEqual({ merged: 1, deleted: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("acknowledged");
    const links = (JSON.parse(rows[0].evidenceJson) as Array<{ link?: string }>).map((entry) => entry.link);
    expect(links).toContain("https://a/1");
    expect(links).toContain("https://a/2");
  });

  it("leaves events with distinct titles or kinds untouched", async () => {
    const company = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const base = { companyId: company.id, severity: "positive", occurredAt: new Date("2026-08-26"), evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, kind: "award", title: "수상 — 대상", evidenceKey: "https://a/1" } });
    await prisma.event.create({ data: { ...base, kind: "award", title: "수상 — 최우수", evidenceKey: "https://a/2" } });
    await prisma.event.create({ data: { ...base, kind: "investment", title: "수상 — 대상", evidenceKey: "https://a/3" } });

    expect(await mergeDuplicateEvents()).toEqual({ merged: 0, deleted: 0 });
    expect(await prisma.event.count()).toBe(3);
  });
});

describe("event repository", () => {
  beforeEach(resetDatabase);

  it("upserts by company, kind and evidence key and keeps the reviewer's record", async () => {
    const company = await prisma.company.create({ data: { name: "딥노이드", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    const first = await upsertEvents([fresh({ companyId: company.id })]);
    const [row] = await listEvents({ year: 2025 });
    await reviewEvent(row.id, "done", "확인함", user.id);

    const second = await upsertEvents([fresh({ companyId: company.id, title: "수상 — 대상(갱신)", trust: "needs_review" })]);
    const [after] = await listEvents({ year: 2025 });

    expect(first).toEqual({ created: 1, updated: 0, merged: 0 });
    expect(second).toEqual({ created: 0, updated: 1, merged: 0 });
    expect(after).toMatchObject({ title: "수상 — 대상(갱신)", trust: "needs_review", status: "done", note: "확인함" });
  });

  it("folds a similar-title same-week article into the existing event instead of creating another", async () => {
    const company = await prisma.company.create({ data: { name: "오토노머스에이투지", year: 2025 } });
    const first = await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 오토노머스에이투지, 중기부 '글로벌 팁스' 선정", evidenceKey: "https://n/1", evidence: [{ label: "기사1", link: "https://n/1" }], occurredAt: new Date("2026-08-20") })]);
    const second = await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 오토노머스에이투지, '글로벌 팁스' 선정…66억 규모 레벨4", evidenceKey: "https://n/2", evidence: [{ label: "기사2", link: "https://n/2" }], occurredAt: new Date("2026-08-21") })]);

    const rows = await listEvents({ year: 2025 });
    expect(first).toEqual({ created: 1, updated: 0, merged: 0 });
    expect(second).toEqual({ created: 0, updated: 0, merged: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].evidence.map((entry) => entry.link)).toEqual(["https://n/1", "https://n/2"]);
  });

  it("keeps a similar story outside the week window as its own event", async () => {
    const company = await prisma.company.create({ data: { name: "오토노머스에이투지", year: 2025 } });
    await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 오토노머스에이투지, 중기부 '글로벌 팁스' 선정", evidenceKey: "https://n/1", occurredAt: new Date("2026-08-20") })]);
    const late = await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 오토노머스에이투지, 중기부 '글로벌 팁스' 선정", evidenceKey: "https://n/2", occurredAt: new Date("2026-09-25") })]);

    expect(late).toEqual({ created: 1, updated: 0, merged: 0 });
    expect(await prisma.event.count()).toBe(2);
  });

  it("keeps different stories of the same kind separate", async () => {
    const company = await prisma.company.create({ data: { name: "무암", year: 2025 } });
    await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 무암, 시리즈B 투자 유치", evidenceKey: "https://n/1", occurredAt: new Date("2026-08-20") })]);
    const other = await upsertEvents([fresh({ companyId: company.id, kind: "positive_press", title: "긍정 보도 — 무암, 신임 CTO 영입", evidenceKey: "https://n/2", occurredAt: new Date("2026-08-20") })]);

    expect(other).toEqual({ created: 1, updated: 0, merged: 0 });
    expect(await prisma.event.count()).toBe(2);
  });

  it("lists by window, kind and status, worst severity first then newest", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await upsertEvents([
      fresh({ companyId: a.id, kind: "positive_press", severity: "positive", evidenceKey: "p1", occurredAt: new Date("2026-08-20") }),
      fresh({ companyId: b.id, kind: "closure", severity: "alert", evidenceKey: "nts:폐업", occurredAt: new Date("2026-08-01") }),
      fresh({ companyId: a.id, kind: "negative_press", severity: "notice", evidenceKey: "n1", occurredAt: new Date("2026-08-28") }),
      fresh({ companyId: a.id, kind: "award", evidenceKey: "old", occurredAt: new Date("2026-06-01") }),
    ]);

    const rows = await listEvents({ year: 2025, since: new Date("2026-07-31") });
    expect(rows.map((r) => r.kind)).toEqual(["closure", "negative_press", "positive_press"]);
    expect(rows[0].companyName).toBe("나");

    expect((await listEvents({ year: 2025, kinds: ["award"] })).map((r) => r.kind)).toHaveLength(1);
    expect(await listEvents({ year: 2025, status: ["done"] })).toEqual([]);
  });

  it("breaks a same-severity same-date tie by insertion order", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const sameDate = new Date("2026-08-20T00:00:00.000Z");
    await upsertEvents([
      fresh({ companyId: a.id, kind: "award", evidenceKey: "first", occurredAt: sameDate }),
      fresh({ companyId: a.id, kind: "investment", evidenceKey: "second", occurredAt: sameDate }),
    ]);

    const rows = await listEvents({ year: 2025 });
    expect(rows.map((r) => r.kind)).toEqual(["award", "investment"]);
    expect(rows[0].id).toBeLessThan(rows[1].id);
  });

  it("reports the newest event's date, not the most severe one's", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    await upsertEvents([
      fresh({ companyId: a.id, kind: "closure", severity: "alert", evidenceKey: "june", occurredAt: new Date("2026-06-01T00:00:00.000Z") }),
      fresh({ companyId: a.id, kind: "award", severity: "positive", evidenceKey: "august", occurredAt: new Date("2026-08-20T00:00:00.000Z") }),
    ]);

    expect(await latestEventAt(2025)).toBe("2026-08-20T00:00:00.000Z");
  });

  it("summarises the window for the header sentence", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const b = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await prisma.company.create({ data: { name: "다", year: 2025 } });
    await upsertEvents([
      fresh({ companyId: a.id, evidenceKey: "1" }),
      fresh({ companyId: a.id, kind: "negative_press", severity: "notice", evidenceKey: "2" }),
      fresh({ companyId: b.id, kind: "closure", severity: "alert", evidenceKey: "3" }),
    ]);

    expect(await summariseEvents(2025, new Date("2026-08-01"))).toEqual({ total: 3, companiesWithEvents: 2, bySeverity: { alert: 1, notice: 1, positive: 1, info: 0 }, open: 3 });
  });

  it("refuses an invalid transition without touching the row", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    await upsertEvents([fresh({ companyId: a.id })]);
    const [row] = await listEvents({ year: 2025 });

    await expect(reviewEvent(row.id, "reopen", null, user.id)).rejects.toThrow();
    expect((await listEvents({ year: 2025 }))[0].status).toBe("open");
  });

  it("accepts a note on any status without changing it, keyed by the note's own value", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    await upsertEvents([fresh({ companyId: a.id })]);
    const [row] = await listEvents({ year: 2025 });

    const noted = await reviewEvent(row.id, "note", "확인 중", user.id);
    expect(noted).toMatchObject({ status: "open", note: "확인 중" });

    const preserved = await reviewEvent(row.id, "note", null, user.id);
    expect(preserved).toMatchObject({ status: "open", note: "확인 중" });

    const cleared = await reviewEvent(row.id, "note", "", user.id);
    expect(cleared).toMatchObject({ status: "open", note: null });
  });

  it("keeps an existing note when a status transition passes no note", async () => {
    const a = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    await upsertEvents([fresh({ companyId: a.id })]);
    const [row] = await listEvents({ year: 2025 });

    await reviewEvent(row.id, "acknowledge", "초기 메모", user.id);
    const after = await reviewEvent(row.id, "done", null, user.id);

    expect(after).toMatchObject({ status: "done", note: "초기 메모" });
  });
});
