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
    <section className="mb-5 rounded-2xl border border-blue-100 bg-white px-4 py-5 shadow-sm sm:mb-8 sm:rounded-3xl sm:px-8 sm:py-8 lg:px-10">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 sm:mb-3 sm:text-xs sm:tracking-[0.18em]">{eyebrow}</p>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:mt-4 sm:text-base">
        {description}
      </p>
    </section>
  );

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-[1480px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
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

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <FreeToolsSidebar activeSlug={activeSlug} />
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
