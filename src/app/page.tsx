import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
        <p className="text-sm text-muted-foreground">
          뉴스·공공·금융 데이터를 종합해 우수기업 선정 근거를 관리합니다.
        </p>
      </div>
      <Button asChild className="w-fit">
        <Link href="/companies">기업 관리로 이동</Link>
      </Button>
    </div>
  );
}
