import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  callbackUrl: string;
  error?: string;
  retryAfterSec?: number;
  action?: (formData: FormData) => void | Promise<void>;
};

export function LoginForm({ callbackUrl, error, retryAfterSec, action }: LoginFormProps) {
  const message =
    error === "TooManyAttempts"
      ? `시도가 너무 잦습니다. ${retryAfterSec ?? 300}초 뒤에 다시 시도해주세요.`
      : error
        ? "이메일 또는 비밀번호가 올바르지 않습니다."
        : null;

  return (
    <form
      action={action}
      className="flex w-full max-w-[380px] flex-col gap-6 border-[1.5px] border-ink bg-background p-7"
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          평가위원회 지원 도구
        </p>
        <h1 className="text-[22px] font-bold tracking-[-0.03em]"><Wordmark height={30} /></h1>
        <p className="text-[13px] text-muted-foreground">
          계정은 운영자가 발급합니다. 가입 절차는 없습니다.
        </p>
      </div>

      {message ? (
        <p
          role="alert"
          className="border-l-2 border-risk bg-risk-surface px-3 py-2 text-[13px] text-risk"
        >
          {message}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13px]">
            이메일
          </Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px]">
            비밀번호
          </Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
      </div>

      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" className="h-10">
        로그인
      </Button>
    </form>
  );
}
