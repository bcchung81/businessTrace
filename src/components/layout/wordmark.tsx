const LOGOTYPE = "기업성과추적";

/**
 * 워드마크 B — 렌즈가 '추'를 관통하며 그 안의 획만 반전된다. 확대가 아니라 대조를 그린다.
 * 높이로 크기를 주고 색은 currentColor·primary 만 쓴다 — 상태색은 브랜드에 쓰지 않는다.
 */
export function Wordmark({ height = 22, className = "" }: { height?: number; className?: string }) {
  const id = `wm-lens-${height}`;
  const scale = height / 30;
  return (
    <span className={`inline-flex items-center ${className}`}>
      <svg
        width={Math.round(146 * scale)}
        height={height}
        viewBox="0 0 146 30"
        aria-hidden="true"
        className="font-display"
      >
        <defs>
          <clipPath id={id}>
            <circle cx="103" cy="14" r="12" />
          </clipPath>
        </defs>
        <text x="0" y="24" fontSize="24" fontWeight="900" letterSpacing="-1.2" fill="currentColor" data-testid="wordmark-text">
          {LOGOTYPE}
        </text>
        <circle cx="103" cy="14" r="12" fill="var(--primary)" />
        <text x="0" y="24" fontSize="24" fontWeight="900" letterSpacing="-1.2" fill="var(--primary-foreground)" clipPath={`url(#${id})`}>
          {LOGOTYPE}
        </text>
        <path d="M112 23 119 30" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{LOGOTYPE}</span>
    </span>
  );
}
