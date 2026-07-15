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
    <section className="mb-5 border-b border-zinc-300 pb-5 pt-1 sm:mb-6 sm:pb-6">
      <div className="max-w-3xl">
        <p className="mb-2 text-xs font-semibold text-blue-700">{eyebrow}</p>
        <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
          {description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-zinc-600">
          <span className="border-l-2 border-blue-600 px-2">회원가입 없이 사용</span>
          <span className="border-l-2 border-zinc-300 px-2">설치 없음</span>
          <span className="border-l-2 border-zinc-300 px-2">업무도구 모음</span>
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen overflow-x-clip bg-zinc-100">
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
        {activeSlug ? (
          <Link
            href="/free-tools"
            aria-label="무료도구 전체 목록으로 이동"
            className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {heroSection}
          </Link>
        ) : (
          heroSection
        )}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <div className="min-w-0">
            <FreeToolsSidebar activeSlug={activeSlug} />
          </div>
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
