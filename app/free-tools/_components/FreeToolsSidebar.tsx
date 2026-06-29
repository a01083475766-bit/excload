import Link from 'next/link';
import { freeTools } from '@/app/free-tools/free-tools-data';

type Props = {
  activeSlug?: string;
};

export function FreeToolsSidebar({ activeSlug }: Props) {
  return (
    <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
      <div className="mb-3 block">
        <h2 className="text-sm font-bold text-slate-950">무료도구 목록</h2>
        <span className="mt-1 block text-xs font-medium text-slate-500">회원가입 없이 바로 사용</span>
      </div>

      <nav
        aria-label="무료도구 목록"
        className="block space-y-2"
      >
        {freeTools.map((tool) => {
          const Icon = tool.icon;
          const active = activeSlug === tool.slug;

          return (
            <Link
              key={tool.slug}
              href={`/free-tools/${tool.slug}`}
              className={`flex h-[88px] items-start gap-3 rounded-2xl border p-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-teal-300/60 hover:bg-white/90 hover:shadow-md ${
                active ? 'border-blue-300 bg-blue-50/90 ring-1 ring-blue-100' : 'border-slate-900/[0.08] bg-white/75'
              }`}
            >
              <span
                className={`mt-0.5 rounded-lg p-2 ${
                  active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {tool.name}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-500">
                  {tool.shortDescription}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
