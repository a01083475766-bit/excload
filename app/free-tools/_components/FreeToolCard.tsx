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
      className="group relative flex h-full min-h-[250px] flex-col overflow-hidden rounded-md border border-zinc-200 bg-white p-5 shadow-sm transition-colors duration-200 hover:border-blue-400 sm:p-6"
    >
      <span className="pointer-events-none absolute right-5 top-5 text-xs font-semibold tabular-nums text-zinc-400">
        {cardIndex}
      </span>
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className="relative rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-blue-600 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50">
          <Icon className="size-6" aria-hidden />
        </span>
        <span
          className={`relative mr-7 rounded border px-2.5 py-1 text-xs font-semibold ${
            tool.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-100 text-zinc-500'
          }`}
        >
          {tool.enabled ? '사용 가능' : '준비중'}
        </span>
      </div>

      <div className="flex flex-1 flex-col">
        <p className="mb-2 text-xs font-semibold text-blue-700">{tool.category}</p>
        <h2 className="text-xl font-bold text-zinc-950">{tool.name}</h2>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600">{tool.description}</p>
        {tool.tags && tool.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tool.tags.map((tag) => (
              <span key={tag} className="rounded bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                {tag}
              </span>
            ))}
          </div>
        )}
        <span className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors group-hover:bg-blue-700 sm:w-fit sm:py-2.5">
          {tool.buttonLabel ?? '무료로 사용하기'} <span className="ml-1 transition group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  );
}
