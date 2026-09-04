import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { LoginForm } from "@/components/layout/login-form";
import { checkLoginAttempt } from "@/lib/services/loginThrottle";
import { clientAddress } from "@/lib/services/clientAddress";
import { devAutofill } from "@/lib/services/devAutofill";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const error = typeof params.error === "string" ? params.error : undefined;
  const retryAfterSec = Number(params.retryAfter) || undefined;

  async function submit(formData: FormData) {
    "use server";
    const target = String(formData.get("callbackUrl") ?? "/");
    const email = String(formData.get("email") ?? "");
    const gate = checkLoginAttempt({ ip: clientAddress(await headers()), email });
    if (!gate.ok) {
      redirect(
        `/login?error=TooManyAttempts&retryAfter=${gate.retryAfterSec}&callbackUrl=${encodeURIComponent(target)}`,
      );
    }

    try {
      await signIn("credentials", {
        email,
        password: String(formData.get("password") ?? ""),
        redirectTo: target,
      });
    } catch (caught) {
      if (caught instanceof AuthError) {
        redirect(`/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(target)}`);
      }
      throw caught;
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-surface p-6">
      <LoginForm callbackUrl={callbackUrl} error={error} retryAfterSec={retryAfterSec} action={submit} prefill={devAutofill() ?? undefined} />
    </div>
  );
}
