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
    <form action={action} className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">성과돋보기</h1>
        <p className="text-sm text-muted-foreground">계속하려면 로그인하세요.</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          이메일 또는 비밀번호가 올바르지 않습니다.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail ?? ""}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          defaultValue={defaultPassword ?? ""}
          required
        />
      </div>

      {prefilled ? (
        <p
          data-testid="autofill-notice"
          className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          테스트 기간 동안 계정이 자동으로 입력됩니다.
        </p>
      ) : null}

      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit">로그인</Button>
    </form>
  );
}
