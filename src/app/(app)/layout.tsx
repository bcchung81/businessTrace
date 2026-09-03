import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/app/actions";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderTools } from "@/components/layout/header-tools";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { readBatch } from "@/lib/services/batchRegistry";
import { loadHeaderTools } from "@/lib/services/headerTools";

/**
 * 로그인한 사람만 보는 화면 전부의 껍데기 — 인가를 여기서 한 번 더 확인한다.
 * proxy 하나에만 걸어 두면 matcher 를 잘못 손대는 순간 화면 전체가 열린다. 되돌아갈 곳은 proxy 가 적어 둔다.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell
      batch={readBatch()}
      tools={<HeaderTools tools={await loadHeaderTools()} />}
      account={<SignOutForm action={signOutAction} />}
    >
      {children}
    </AppShell>
  );
}
