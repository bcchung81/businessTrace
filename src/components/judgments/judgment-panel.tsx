import { JUDGMENT_QUESTIONS, type JudgmentField, type JudgmentView } from "@/lib/services/judgments";

const QUESTION_ORDER: JudgmentField[] = ["entity", "role", "form", "about"];

const QUESTION_TEXT: Record<JudgmentField, { title: string; help?: string }> = {
  entity: { title: "같은 회사인가", help: "기사 속 그 이름이 위 회사를 가리키나요? 동명 회사·브랜드·약어면 아니오." },
  role: { title: "기사 속 역할", help: "같은 회사일 때만 고릅니다." },
  form: { title: "기사 형식" },
  about: { title: "이 회사의 주제 기사로 칠까요", help: "평가위원회 자료에 이 회사 기사로 넣을지로 판단합니다. 다음 분석부터 반영됩니다." },
};

/**
 * 네 문항과 메모. 분석기의 답은 주제 판정이 저장된 뒤에만 아래에 연다 — 판정이 모델 답에 끌려가지 않게 한다.
 */
export function JudgmentPanel({
  item,
  onChoose,
  onNote,
  onNoteBlur,
  saveState,
}: {
  item: JudgmentView;
  onChoose: (field: JudgmentField, value: string) => void;
  onNote: (note: string) => void;
  onNoteBlur: () => void;
  saveState: string | null;
}) {
  return (
    <aside aria-label="판정" className="flex flex-col gap-4">
      {QUESTION_ORDER.map((field, index) => (
        <div key={field} className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[11px] font-semibold text-primary">{index + 1}</span>
            <span className="text-[13px] font-extrabold">{QUESTION_TEXT[field].title}</span>
          </div>
          {QUESTION_TEXT[field].help ? <p className="text-[11px] leading-snug text-muted-foreground">{QUESTION_TEXT[field].help}</p> : null}
          <div role="radiogroup" aria-label={QUESTION_TEXT[field].title} className="flex flex-col gap-1">
            {JUDGMENT_QUESTIONS[field].map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={item.answer[field] === option.value}
                onClick={() => onChoose(field, option.value)}
                className={`flex items-center justify-between gap-2 border-[1.5px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-secondary aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:font-bold ${field === "about" ? "border-ink" : "border-hairline"}`}
              >
                <span className="flex flex-col">
                  {option.label}
                  {option.hint ? <small className="text-[10.5px] font-normal text-muted-foreground">{option.hint}</small> : null}
                </span>
                <kbd className="font-mono text-[10.5px] text-muted-foreground">{option.key}</kbd>
              </button>
            ))}
          </div>
        </div>
      ))}

      <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
        메모
        <textarea
          key={item.id}
          defaultValue={item.answer.note ?? ""}
          onChange={(event) => onNote(event.target.value)}
          onBlur={onNoteBlur}
          rows={3}
          placeholder="판단이 갈린 이유가 있으면 적어 주세요"
          className="border-[1.5px] border-hairline bg-background px-2 py-1.5 text-[12.5px] font-normal"
        />
      </label>
      <p aria-live="polite" className="min-h-4 text-[11px] text-muted-foreground">
        {saveState}
      </p>

      {item.judged && item.verdict ? (
        <p className="flex flex-col gap-0.5 border-t border-hairline pt-2 text-[12px]">
          <span className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground">분석기 답</span>
          <span>{item.verdict}</span>
        </p>
      ) : null}
    </aside>
  );
}
