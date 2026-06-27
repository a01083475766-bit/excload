import Link from 'next/link';
import type { FreeTool } from '@/app/free-tools/free-tools-data';

type Props = {
  tool: FreeTool;
};

export function FreeToolCard({ tool }: Props) {
  const Icon = tool.icon;

  return (
    <Link
      href={`/free-tools/${tool.slug}`}
      className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
        <span className="rounded-2xl bg-blue-50 p-2.5 text-blue-600 sm:p-3">
          <Icon className="size-6" aria-hidden />
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            tool.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          {tool.enabled ? '사용 가능' : '준비중'}
        </span>
      </div>

      <div className="flex flex-1 flex-col">
        <p className="mb-2 text-xs font-medium text-blue-600">{tool.category}</p>
        <h2 className="text-lg font-bold text-zinc-950">{tool.name}</h2>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600">{tool.description}</p>
        <span className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition group-hover:bg-blue-700 sm:w-fit sm:py-2">
          무료로 사용하기
        </span>
      </div>
    </Link>
  );
}
