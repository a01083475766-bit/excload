import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ONECLOAD | 온라인 판매자를 위한 주문 업무 자동화",
  description: "온라인 판매자의 반복 주문 업무를 줄이는 기능을 준비하고 있습니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
