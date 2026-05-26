import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "./components/MainNav";
import AuthProviders from "./components/AuthProviders";
import StoreInitializer from "./components/StoreInitializer";
import GlobalDragDropBlocker from "./components/GlobalDragDropBlocker";
import GlobalPopupManager from "./components/GlobalPopupManager";
import ClientConsoleSilencer from "./components/ClientConsoleSilencer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "엑클로드",
  description: "엑셀 주문 변환 서비스",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <ClientConsoleSilencer />
        <div className="flex flex-1 flex-col">
          <AuthProviders>
            <StoreInitializer />
            <GlobalDragDropBlocker />
            <MainNav />
            <div className="flex-1 pt-[44px] pb-16 sm:pt-[35px] sm:pb-20">
              {children}
            </div>
          </AuthProviders>
        </div>
        <footer className="mt-auto shrink-0 border-t border-zinc-200 px-4 py-5 text-center text-[11px] leading-5 text-zinc-500 sm:py-6 sm:text-xs sm:leading-relaxed">
          <p className="mx-auto max-w-5xl">
            상호: 원클 (엑클로드 EXCLOAD) | 대표자: 최영순 | 사업자등록번호: 834-19-02117 | 주소: 인천시
            미추홀구 낙섬중로129 상가4동 207호
          </p>
          <p className="mx-auto mt-0.5 max-w-5xl">
            전화번호: 010-8347-5766 | 이메일: sacom5766@naver.com | 통신판매업 신고번호:
            2026-인천미추홀-0416
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] sm:text-xs">
            <a href="/terms" className="underline underline-offset-2 hover:text-zinc-700">
              이용약관
            </a>
            <span className="text-zinc-400">|</span>
            <a href="/privacy" className="underline underline-offset-2 hover:text-zinc-700">
              개인정보처리방침
            </a>
            <span className="text-zinc-400">|</span>
            <a href="/refund" className="underline underline-offset-2 hover:text-zinc-700">
              환불정책
            </a>
          </div>
        </footer>
        <GlobalPopupManager />
      </body>
    </html>
  );
}
