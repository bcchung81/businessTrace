/**
 * 두세 개 중 하나를 고르는 사각 라디오 묶음 — 선택은 잉크 채움, 나머지는 hairline 테두리.
 * 기간·정렬처럼 표 위에 놓이는 스위치는 전부 이 하나로 그린다.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center text-[11.5px]">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`-ml-px border-[1.5px] px-2.5 py-0.5 font-bold first:ml-0 ${selected ? "border-ink bg-ink text-background" : "border-hairline text-muted-foreground"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
