"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { RibbonChoice } from "@/lib/services/freshness";

/**
 * 리본의 할 일 하나를 눌러 처리할 목록을 펼친다 — 고르면 그 기업 상세로 간다.
 * 숫자만 보고 다른 화면에서 다시 고르는 걸음을 없앤다. Esc·바깥 클릭으로 닫고 위아래·엔터로도 고른다.
 * 열리면 목록이 초점을 받는다 — 활성 항목(aria-activedescendant)은 초점을 가진 요소가 가리켜야 읽힌다.
 */
export function RibbonMenu({ text, choices }: { text: string; choices: RibbonChoice[] }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    function handleOutside(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function optionId(index: number) {
    return `${listId}-${index}`;
  }

  function move(step: number) {
    if (!open) {
      setOpen(true);
      setHighlight(0);
      return;
    }
    setHighlight((prev) => (prev + step + choices.length) % choices.length);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && open) {
      const choice = choices[highlight];
      if (!choice) return;
      event.preventDefault();
      setOpen(false);
      router.push(choice.href);
    }
  }

  return (
    <div ref={wrapper} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className="font-display text-[12px] font-bold underline decoration-primary-foreground/60 underline-offset-4 hover:decoration-primary-foreground"
      >
        {text}
      </button>
      {open ? (
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={text}
          aria-activedescendant={optionId(highlight)}
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto border border-band-foreground/40 bg-band text-band-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-foreground/60"
        >
          {choices.map((choice, index) => (
            <Link
              key={choice.href}
              id={optionId(index)}
              role="option"
              aria-selected={index === highlight}
              href={choice.href}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => setOpen(false)}
              className={`flex flex-col gap-0.5 px-3 py-1.5 hover:bg-band-foreground/10 ${index === highlight ? "bg-band-foreground/10" : ""}`}
            >
              <span className="text-[12px] font-bold">{choice.label}</span>
              {choice.note ? <span className="text-[11px] font-medium text-band-foreground/65">{choice.note}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
