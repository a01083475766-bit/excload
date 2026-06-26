import type { ReactNode } from 'react';
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
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-[1480px] px-3 py-8 sm:px-5 lg:px-8">
        <section className="mb-8 rounded-3xl border border-blue-100 bg-white px-5 py-8 shadow-sm sm:px-8 lg:px-10">
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-blue-600">{eyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            {description}
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <FreeToolsSidebar activeSlug={activeSlug} />
          <section className="min-w-0">{children}</section>
        </div>
      </div>
    </main>
  );
}
