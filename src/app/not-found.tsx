import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col gap-3 border-t-4 border-ink pt-3">
      <h1 className="font-display text-[28px] font-black tracking-[-0.03em]">없는 페이지</h1>
      <p className="text-[13px] text-muted-foreground">주소가 틀렸거나 기업이 제외·삭제됐습니다.</p>
      <Link href="/companies" className="self-start border-b border-primary text-[13px] font-bold text-primary">기업 목록으로</Link>
    </div>
  );
}
