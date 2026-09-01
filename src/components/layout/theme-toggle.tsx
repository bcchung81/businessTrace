"use client";

/**
 * 라이트·다크 전환 — 고른 값을 localStorage 에 남긴다.
 * 아이콘은 상태가 아니라 CSS 로 가른다(`dark:` 변형). 마운트 뒤에 상태를 읽으면 첫 그림이 한 번 틀린다.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // 저장이 막혀도 이번 화면의 전환은 살린다 — 기억만 못 할 뿐이다.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="화면 테마 전환"
      title="화면 테마 전환"
      className="ml-auto flex size-7 shrink-0 items-center justify-center border-[1.5px] border-band-foreground/30 text-band-foreground transition-colors hover:border-band-foreground/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-foreground"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="size-4 dark:hidden">
        <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
      </svg>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="hidden size-4 dark:block">
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" strokeLinecap="round" />
      </svg>
    </button>
  );
}
