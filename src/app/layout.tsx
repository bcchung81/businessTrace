import type { Metadata } from "next";
import { Geist, Geist_Mono, Gothic_A1 } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gothicA1 = Gothic_A1({ weight: ["700", "900"], subsets: ["latin"], variable: "--font-gothic-a1", display: "swap" });

export const metadata: Metadata = {
  title: "성과돋보기",
  description: "뉴스·AI 기반 기업 분석 및 우수기업 선정 관리 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${gothicA1.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
