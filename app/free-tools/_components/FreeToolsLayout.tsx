import type { ReactNode } from 'react';
import Link from 'next/link';
import { FreeToolsSidebar } from '@/app/free-tools/_components/FreeToolsSidebar';

type Props = {
  activeSlug?: string;
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function FreeToolsLayout({
  activeSlug,
  eyebrow = 'FREE TOOLS',
  title,
  description,
  children,
}: Props) {
  const heroSection = (
    <section className="relative mb-5 overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-9 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] backdrop-blur-xl sm:mb-8 sm:px-8 sm:py-12 lg:px-12">
      <div className="pointer-events-none absolute left-8 top-6 h-28 w-28 rounded-full bg-teal-200/25 blur-3xl" />
      <div className="pointer-events-none absolute right-8 top-8 h-32 w-32 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="relative">
        <p className="mb-3 text-[11px] font-extrabold tracking-[0.22em] text-teal-600 sm:text-xs">{eyebrow}</p>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-600">
          <span className="rounded-full border border-teal-100 bg-teal-50/80 px-3 py-1 text-teal-700">회원가입 없이 사용</span>
          <span className="rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-blue-700">설치 없음</span>
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">업무도구 모음</span>
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_85%_5%,rgba(96,165,250,0.14),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_45%,#ffffff_100%)]">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        {activeSlug ? (
          <Link
            href="/free-tools"
            aria-label="무료도구 전체 목록으로 이동"
            className="block rounded-[1.75rem] transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {heroSection}
          </Link>
        ) : (
          heroSection
        )}

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <FreeToolsSidebar activeSlug={activeSlug} />
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
