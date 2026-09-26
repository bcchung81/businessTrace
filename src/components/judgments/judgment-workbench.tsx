"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { JudgmentArticle } from "@/components/judgments/judgment-article";
import { JudgmentPanel } from "@/components/judgments/judgment-panel";
import { Button } from "@/components/ui/button";
import type { JudgmentAnswer } from "@/lib/repositories/articleJudgment";
import { JUDGMENT_QUESTIONS, type JudgmentField, type JudgmentView } from "@/lib/services/judgments";

type SaveInput = { id: number } & Partial<JudgmentAnswer>;
type SaveResult = { ok: true; judgment: JudgmentView } | { ok: false; message: string };
type Status = "todo" | "done" | "all";
type Origin = "all" | JudgmentView["origin"];
type ReflectCompany = { companyId: number; name: string; judged: number };

const STATUS_LABEL: Record<Status, string> = { todo: "미판정", done: "판정 완료", all: "전체" };
const ORIGIN_LABEL: Record<Origin, string> = { all: "모든 경로", held: "보류", gate: "게이트", manual: "수동" };
const NOTE_DELAY_MS = 600;
const WINDOW_DAYS = 90;

const KEYMAP = new Map(
  (Object.entries(JUDGMENT_QUESTIONS) as Array<[JudgmentField, Array<{ value: string; key: string }>]>).flatMap(([field, options]) =>
    options.map((option) => [option.key.toLowerCase(), { field, value: option.value }] as const),
  ),
);

const isTyping = (target: EventTarget | null) =>
  typeof HTMLElement !== "undefined" && target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const originTag = (item: JudgmentView) => (item.origin === "gate" ? (item.required ? "게이트 필수" : "게이트") : ORIGIN_LABEL[item.origin]);

function withAnswer(item: JudgmentView, patch: Partial<JudgmentAnswer>): JudgmentView {
  const answer = { ...item.answer, ...patch };
  return { ...item, answer, judged: answer.about !== null, verdict: answer.about !== null ? item.verdict : null };
}

/**
 * 판정 대기열을 한 화면에서 처리한다 — 목록·기사·판정 패널, 아티팩트와 같은 키보드.
 * 저장은 낙관적으로 먼저 그리고 서버 답으로 바꾼다. 주제 판정이 바뀌면 서버를 다시 읽어 반영 대기를 갱신한다.
 */
export function JudgmentWorkbench({
  items: initial,
  reflect,
  save,
  fetchImpl = fetch,
}: {
  items: JudgmentView[];
  reflect: ReflectCompany[];
  save: (input: SaveInput) => Promise<SaveResult>;
  fetchImpl?: typeof fetch;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [currentId, setCurrentId] = useState<number | null>(initial.find((item) => !item.judged)?.id ?? initial[0]?.id ?? null);
  const [status, setStatus] = useState<Status>("todo");
  const [origin, setOrigin] = useState<Origin>("all");
  const [saveState, setSaveState] = useState<string | null>(null);
  const [reflectState, setReflectState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const noteTimer = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);

  const visible = items.filter((item) => (status === "all" || (status === "todo" ? !item.judged : item.judged)) && (origin === "all" || item.origin === origin));
  const current = items.find((item) => item.id === currentId) ?? null;
  const pending = items.filter((item) => !item.judged).length;
  const required = items.filter((item) => item.origin === "gate" && item.required);

  const replace = (next: JudgmentView) => setItems((all) => all.map((item) => (item.id === next.id ? next : item)));

  const persist = useCallback(
    async (before: JudgmentView, patch: Partial<JudgmentAnswer>) => {
      setItems((all) => all.map((item) => (item.id === before.id ? withAnswer(item, patch) : item)));
      setSaveState("저장 중");
      const result = await save({ id: before.id, ...patch });
      if (!result.ok) {
        replace(before);
        setSaveState(`저장하지 못했습니다 — ${result.message}`);
        return;
      }
      replace(result.judgment);
      setSaveState("저장됨");
      if (patch.about !== undefined) router.refresh();
    },
    [save, router],
  );

  const choose = useCallback(
    (field: JudgmentField, value: string) => {
      if (!current) return;
      const next = current.answer[field] === value ? null : value;
      const patch: Partial<JudgmentAnswer> = { [field]: next };
      if (field === "entity" && next === "other" && current.answer.role !== null) patch.role = null;
      void persist(current, patch);
    },
    [current, persist],
  );

  const flushNote = () => {
    const scheduled = noteTimer.current;
    if (!scheduled) return;
    clearTimeout(scheduled.timer);
    noteTimer.current = null;
    scheduled.run();
  };

  const scheduleNote = (note: string) => {
    if (!current) return;
    if (noteTimer.current) clearTimeout(noteTimer.current.timer);
    const target = current;
    const run = () => void persist(target, { note: note.trim() ? note : null });
    noteTimer.current = { timer: setTimeout(() => ((noteTimer.current = null), run()), NOTE_DELAY_MS), run };
  };

  const go = useCallback(
    (offset: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((item) => item.id === currentId);
      const nextIndex = index === -1 ? 0 : Math.max(0, Math.min(visible.length - 1, index + offset));
      setCurrentId(visible[nextIndex].id);
    },
    [visible, currentId],
  );

  const nextTodo = useCallback(() => {
    const start = items.findIndex((item) => item.id === currentId);
    for (let step = 1; step <= items.length; step += 1) {
      const candidate = items[(start + step + items.length) % items.length];
      if (!candidate.judged && (origin === "all" || candidate.origin === origin)) {
        setCurrentId(candidate.id);
        return;
      }
    }
  }, [items, currentId, origin]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "Enter") {
        if (event.target instanceof HTMLAnchorElement) return;
        event.preventDefault();
        nextTodo();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "j") return go(1);
      if (key === "k") return go(-1);
      const mapped = KEYMAP.get(key);
      if (mapped) choose(mapped.field, mapped.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, go, nextTodo]);

  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current.timer);
  }, []);

  const reanalyze = async () => {
    setReflectState({ busy: true, message: null });
    try {
      const response = await fetchImpl("/api/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyIds: reflect.map((company) => company.companyId),
          stage: "full",
          force: true,
          limit: 20,
          startDate: new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
        }),
      });
      if (response.status === 202) {
        setReflectState({ busy: false, message: "재분석을 시작했습니다 — 진행은 헤더에서 봅니다." });
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setReflectState({ busy: false, message: body?.message ?? `재분석을 시작하지 못했습니다 (${response.status})` });
    } catch (caught) {
      setReflectState({ busy: false, message: caught instanceof Error ? caught.message : "재분석 요청 실패" });
    }
  };

  if (initial.length === 0) {
    return <p className="text-[13px] text-muted-foreground">판정할 기사가 없습니다. 분석기가 보류한 기사, 게이트 표본, 기업 상세에서 올린 기사가 여기 모입니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] tabular-nums">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">미판정</dt>
            <dd className="font-bold">{pending}</dd>
          </div>
          {required.length > 0 ? (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">게이트 필수</dt>
              <dd className="font-bold">
                {required.filter((item) => item.judged).length} / {required.length}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">반영 대기</dt>
            <dd className="font-bold">{reflect.length}개사</dd>
          </div>
        </dl>
        <div className="flex items-center gap-2">
          {reflectState.message ? <span className="text-[11.5px] text-muted-foreground">{reflectState.message}</span> : null}
          <Button type="button" variant="signal" size="sm" disabled={reflect.length === 0 || reflectState.busy} onClick={() => void reanalyze()}>
            반영 재분석 {reflect.length > 0 ? `${reflect.length}개사` : ""}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div role="group" aria-label="판정 상태" className="flex">
          {(Object.keys(STATUS_LABEL) as Status[]).map((key) => (
            <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className="-ml-px border-[1.5px] border-hairline px-2.5 py-0.5 text-[12px] font-bold text-muted-foreground first:ml-0 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background">
              {STATUS_LABEL[key]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="올라온 경로" className="flex">
          {(Object.keys(ORIGIN_LABEL) as Origin[]).map((key) => (
            <button key={key} type="button" aria-pressed={origin === key} onClick={() => setOrigin(key)} className="-ml-px border-[1.5px] border-hairline px-2.5 py-0.5 text-[12px] font-bold text-muted-foreground first:ml-0 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background">
              {ORIGIN_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col gap-2">
          <select aria-label="기사로 이동" value={currentId ?? ""} onChange={(event) => setCurrentId(Number(event.target.value))} className="border-[1.5px] border-hairline bg-background px-2 py-1 text-[12px] lg:hidden">
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.judged ? "✓ " : ""}
                {item.companyName} — {item.title.slice(0, 40)}
              </option>
            ))}
          </select>
          <nav aria-label="판정할 기사" className="hidden max-h-[70vh] flex-col overflow-y-auto border-t border-hairline lg:flex">
            {visible.length === 0 ? <p className="py-3 text-[12px] text-muted-foreground">이 조건에 맞는 기사가 없습니다.</p> : null}
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === currentId}
                onClick={() => setCurrentId(item.id)}
                className="flex flex-col gap-0.5 border-b border-hairline px-2 py-2 text-left hover:bg-secondary aria-[current=true]:border-l-[3px] aria-[current=true]:border-l-primary aria-[current=true]:bg-surface"
              >
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span aria-hidden className={`inline-block size-1.5 ${item.judged ? "bg-verified" : "bg-pending"}`} />
                  <b className="truncate">{item.companyName}</b>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{originTag(item)}</span>
                </span>
                <span className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{item.title}</span>
              </button>
            ))}
          </nav>
        </div>

        {current ? (
          <>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground tabular-nums">
                <span>
                  {items.findIndex((item) => item.id === current.id) + 1} / {items.length} · {originTag(current)}
                  {current.stratum ? ` · 층 ${current.stratum}` : ""}
                </span>
                <span className="flex gap-1.5">
                  <Button type="button" variant="signal-outline" size="xs" onClick={() => go(-1)}>
                    이전 K
                  </Button>
                  <Button type="button" variant="signal-outline" size="xs" onClick={() => go(1)}>
                    다음 J
                  </Button>
                  <Button type="button" variant="signal" size="xs" onClick={nextTodo}>
                    다음 미판정 Enter
                  </Button>
                </span>
              </div>
              <JudgmentArticle item={current} />
            </div>
            <JudgmentPanel item={current} onChoose={choose} onNote={scheduleNote} onNoteBlur={flushNote} saveState={saveState} />
          </>
        ) : null}
      </div>
    </div>
  );
}
