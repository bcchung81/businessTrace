import { redirect } from "next/navigation";

/**
 * 루트는 동향 대시보드다 — 운영자가 여는 첫 화면은 이달의 사건이어야 한다.
 */
export default function Home() {
  redirect("/dashboard");
}
