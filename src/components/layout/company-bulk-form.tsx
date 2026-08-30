import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyBulkFormProps = {
  year: number;
  action?: (formData: FormData) => void | Promise<void>;
  notice?: string;
  runHref?: string;
};

export function CompanyBulkForm({ year, action, notice, runHref }: CompanyBulkFormProps) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 border-t-2 border-ink bg-background pt-4"
    >
      <div className="flex flex-col gap-1.5 sm:max-w-[160px]">
        <Label htmlFor="year" className="text-[13px]">
          평가연도
        </Label>
        <Input id="year" name="year" type="number" defaultValue={year} required className="font-mono" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="names" className="text-[13px]">
          기업명 (한 줄에 하나)
        </Label>
        <textarea
          id="names"
          name="names"
          rows={8}
          placeholder={"크립토랩\n올림플래닛\n넷록스"}
          className="min-h-36 border-[1.5px] border-hairline bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          required
        />
        <p className="text-[12px] text-muted-foreground">
          이미 등록된 기업은 건너뛰고 결과를 알려줍니다.
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className="border-l-2 border-primary bg-accent px-3 py-2 text-[13px] text-accent-foreground"
        >
          {notice}
          {runHref ? (
            <a href={runHref} className="ml-3 border-b border-primary font-bold text-primary">
              지금 분석 실행
            </a>
          ) : null}
        </p>
      ) : null}

      <Button type="submit" className="h-10 self-start">
        일괄 등록
      </Button>
    </form>
  );
}
