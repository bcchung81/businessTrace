import Link from "next/link";
import { Button } from "@/components/ui/button";

const PIPELINE = [
  { step: "수집", detail: "네이버 API HUB · 구글 뉴스 RSS · 기사 본문 크롤링" },
  { step: "분석", detail: "Anthropic 모델로 동향·수상·투자 판정" },
  { step: "검증", detail: "출처·근거충실도·어휘겹침·반증 4층 대조" },
  { step: "리포트", detail: "평가위원회 제출용 다차원 분석자료" },
] as const;

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          평가위원회 지원 도구
        </p>
        <h1 className="max-w-2xl text-[32px] font-bold leading-[1.25] tracking-[-0.03em]">
          AI가 만든 근거를 공식 출처와 대조한 뒤에 보여줍니다.
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          뉴스·공공·금융 데이터를 종합해 우수기업 50개사 선정 근거를 만듭니다. 대조를 통과하지 못한
          분석은 <span className="font-semibold text-review">검토 필요</span>로 남고, 자동으로
          통과시키지 않습니다.
        </p>
        <Button asChild className="mt-2 w-fit">
          <Link href="/companies">기업 관리로 이동</Link>
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-muted-foreground">분석 흐름</h2>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-2">
          {PIPELINE.map((entry) => (
            <li key={entry.step} className="flex flex-col gap-1 bg-background p-4">
              <span className="text-[14px] font-semibold">{entry.step}</span>
              <span className="text-[13px] leading-relaxed text-muted-foreground">{entry.detail}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
