import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { LoginForm } from "@/components/layout/login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const error = typeof params.error === "string" ? params.error : undefined;

  async function submit(formData: FormData) {
    "use server";
    const target = String(formData.get("callbackUrl") ?? "/");
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
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
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginForm callbackUrl={callbackUrl} error={error} action={submit} />
    </main>
  );
}
