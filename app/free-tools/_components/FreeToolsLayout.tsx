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
  eyebrow = 'EXCLOAD FREE TOOLS',
  title,
  description,
  children,
}: Props) {
  const heroSection = (
    <section className="mb-5 overflow-hidden rounded-[2rem] border border-blue-100 bg-white px-5 py-8 text-center shadow-sm sm:mb-8 sm:px-8 sm:py-10 lg:px-12">
      <p className="mb-3 text-[11px] font-bold tracking-[0.22em] text-blue-600 sm:text-xs">{eyebrow}</p>
      <h1 className="text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-zinc-600">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">회원가입 없이 사용</span>
        <span className="rounded-full bg-zinc-100 px-3 py-1">설치 없음</span>
        <span className="rounded-full bg-zinc-100 px-3 py-1">쇼핑몰 운영 보조</span>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-[1200px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
        {activeSlug ? (
          <Link
            href="/free-tools"
            aria-label="무료도구 전체 목록으로 이동"
            className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:rounded-3xl"
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
