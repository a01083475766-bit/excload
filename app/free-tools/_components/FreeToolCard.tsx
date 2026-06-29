import Link from 'next/link';
import type { FreeTool } from '@/app/free-tools/free-tools-data';

type Props = {
  tool: FreeTool;
  index?: number;
};

export function FreeToolCard({ tool, index = 0 }: Props) {
  const Icon = tool.icon;
  const cardIndex = String(index + 1).padStart(2, '0');

  return (
    <Link
      href={`/free-tools/${tool.slug}`}
      className="group relative flex h-full min-h-[260px] flex-col overflow-hidden rounded-[1.35rem] border border-slate-900/[0.08] bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-teal-400/40 hover:shadow-[0_24px_70px_rgba(15,23,42,0.13)] sm:p-6"
    >
      <span className="pointer-events-none absolute right-5 top-4 text-5xl font-black leading-none tracking-[-0.06em] text-slate-900/[0.045] transition group-hover:text-teal-500/10 sm:text-6xl">
        {cardIndex}
      </span>
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-100/60 blur-2xl transition group-hover:bg-teal-100" />
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="relative rounded-2xl border border-blue-100 bg-blue-50/80 p-3 text-blue-600 shadow-sm transition group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700">
          <Icon className="size-6" aria-hidden />
        </span>
        <span
          className={`relative rounded-full border px-2.5 py-1 text-xs font-bold ${
            tool.enabled ? 'border-emerald-100 bg-emerald-50/90 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {tool.enabled ? '사용 가능' : '준비중'}
        </span>
      </div>

      <div className="flex flex-1 flex-col">
        <p className="mb-2 text-xs font-extrabold tracking-[0.16em] text-teal-600">{tool.category}</p>
        <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">{tool.name}</h2>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{tool.description}</p>
        <span className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition group-hover:bg-blue-600 sm:w-fit sm:py-2.5">
          무료로 사용하기 <span className="ml-1 transition group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}
