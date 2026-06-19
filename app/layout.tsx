import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_URL,
  buildOpenGraph,
} from "./lib/seo-metadata";
import "./globals.css";
import MainNav from "./components/MainNav";
import AuthProviders from "./components/AuthProviders";
import StoreInitializer from "./components/StoreInitializer";
import GlobalDragDropBlocker from "./components/GlobalDragDropBlocker";
import GlobalPopupManager from "./components/GlobalPopupManager";
import ClientConsoleSilencer from "./components/ClientConsoleSilencer";
import SiteFooter from "./components/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  icons: {
    icon: "/favicon.png",
  },
  openGraph: buildOpenGraph(DEFAULT_TITLE, DEFAULT_DESCRIPTION, "/"),
  verification: {
    other: {
      "naver-site-verification": "fd86a20c43229de14d33cf798a4f86706b09a326",
    },
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
        <SiteFooter />
        <GlobalPopupManager />
      </body>
    </html>
  );
}
