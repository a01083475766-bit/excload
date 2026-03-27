import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MainNav from "./components/MainNav";
import StoreInitializer from "./components/StoreInitializer";
import GlobalDragDropBlocker from "./components/GlobalDragDropBlocker";
import GlobalPopupManager from "./components/GlobalPopupManager";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StoreInitializer />
        <GlobalDragDropBlocker />
        <MainNav />
        <div className="pt-[48px]">
          {children}
        </div>
        <footer className="mt-8 border-t border-zinc-200 px-4 py-6 text-center text-xs leading-6 text-zinc-500">
          <p>
            상호명: 원클 | 대표자: 최영순 | 사업자등록번호: 834-19-02117 | 주소: 인천시
            미추홀구 낙섬중로129 상가4동 207호
          </p>
          <p>
            전화번호: 010-8347-5766 | 이메일: sacom5766@naver.com | 통신판매업 신고번호:
            심사진행중 (승인 후 기재 예정)
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
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
