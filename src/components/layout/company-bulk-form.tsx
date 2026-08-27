import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyBulkFormProps = {
  year: number;
  action?: (formData: FormData) => void | Promise<void>;
  notice?: string;
};

export function CompanyBulkForm({ year, action, notice }: CompanyBulkFormProps) {
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="year">평가연도</Label>
        <Input id="year" name="year" type="number" defaultValue={year} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="names">기업명 (한 줄에 하나)</Label>
        <textarea
          id="names"
          name="names"
          rows={8}
          placeholder={"크립토랩\n올림플래닛\n넷록스"}
          className="min-h-32 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          required
        />
      </div>

      {notice ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Button type="submit" className="self-start">
        일괄 등록
      </Button>
    </form>
  );
}
