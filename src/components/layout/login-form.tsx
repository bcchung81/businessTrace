import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  callbackUrl: string;
  error?: string;
  action?: (formData: FormData) => void | Promise<void>;
  defaultEmail?: string;
  defaultPassword?: string;
};

export function LoginForm({
  callbackUrl,
  error,
  action,
  defaultEmail,
  defaultPassword,
}: LoginFormProps) {
  const prefilled = Boolean(defaultEmail || defaultPassword);

  return (
    <form
      action={action}
      className="flex w-full max-w-[380px] flex-col gap-6 rounded-xl border border-hairline bg-background p-7 shadow-[0_2px_4px_-2px_rgba(23,23,25,0.06),0_4px_6px_-1px_rgba(23,23,25,0.06)]"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          평가위원회 지원 도구
        </p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">성과돋보기</h1>
        <p className="text-[13px] text-muted-foreground">
          계정은 운영자가 발급합니다. 가입 절차는 없습니다.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-risk/25 bg-risk-surface px-3 py-2 text-[13px] text-risk"
        >
          이메일 또는 비밀번호가 올바르지 않습니다.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13px]">
            이메일
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail ?? ""}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px]">
            비밀번호
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            defaultValue={defaultPassword ?? ""}
            required
          />
        </div>
      </div>

      {prefilled ? (
        <p
          data-testid="autofill-notice"
          className="rounded-md border border-review/25 bg-review-surface px-3 py-2 text-[12px] leading-relaxed text-review"
        >
          테스트 기간 동안 계정이 자동으로 입력됩니다. 배포 전 환경변수에서 제거하세요.
        </p>
      ) : null}

      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" className="h-10">
        로그인
      </Button>
    </form>
  );
}
