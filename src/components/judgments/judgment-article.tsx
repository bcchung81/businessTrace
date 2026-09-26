import { Fragment } from "react";
import { highlightSegments, type JudgmentView } from "@/lib/services/judgments";

/**
 * 회사명·별칭을 mark 로 감싸 그린다. 본문을 HTML 로 넣지 않고 조각으로 그린다.
 */
function Highlighted({ text, names }: { text: string; names: string[] }) {
  return (
    <>
      {highlightSegments(text, names).map((segment, index) =>
        segment.mark ? (
          <mark key={index} className="bg-primary/15 px-0.5 text-foreground">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * 판정할 회사의 정보와 기사 원문. 회사 정보를 먼저 둔다 — 동명 타사는 업종·대표를 보고서야 가려진다.
 */
export function JudgmentArticle({ item }: { item: JudgmentView }) {
  const names = [item.companyName, ...item.aliases];
  const mentions = highlightSegments(item.body, [item.companyName]).filter((segment) => segment.mark).length;
  const facts = [
    ["정식명", item.officialName],
    ["업종", item.industry],
    ["대표자", item.ceoName],
    ["별칭", item.aliases.join(", ")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="flex min-w-0 flex-col gap-3">
      <section aria-label="판정할 회사" className="border-l-[3px] border-primary bg-surface px-3 py-2">
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground">판정할 회사</span>
        <p className="font-display text-[18px] font-black leading-tight">{item.companyName}</p>
        {facts.length > 0 ? (
          <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex gap-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <h3 className="text-[17px] font-extrabold leading-snug">
        <Highlighted text={item.title} names={names} />
      </h3>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground tabular-nums">
        <span>{item.source}</span>
        <span>{item.published}</span>
        <span>
          본문 {item.body.length.toLocaleString()}자 · 회사명 {mentions}회
        </span>
        <a href={item.link} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          원문 열기
        </a>
      </p>

      {item.body ? (
        <div className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.8]">
          <Highlighted text={item.body} names={names} />
        </div>
      ) : (
        <p className="text-[13px] font-bold text-review">본문이 수집되지 않았습니다.</p>
      )}
    </article>
  );
}
