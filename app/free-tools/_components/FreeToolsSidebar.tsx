import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { freeTools } from '@/app/free-tools/free-tools-data';

type Props = {
  activeSlug?: string;
};

type ToolNavLinkProps = {
  slug: string;
  name: string;
  shortDescription: string;
  icon: LucideIcon;
  active: boolean;
  variant: 'mobile' | 'desktop';
};

function ToolNavLink({ slug, name, shortDescription, icon: Icon, active, variant }: ToolNavLinkProps) {
  const activeClass = active
    ? 'border-blue-300 bg-blue-50/90 ring-1 ring-blue-100'
    : 'border-slate-900/[0.08] bg-white/75';

  if (variant === 'mobile') {
    return (
      <Link
        href={`/free-tools/${slug}`}
        className={`flex shrink-0 snap-start items-center gap-2 rounded-2xl border px-3 py-2.5 text-left shadow-sm backdrop-blur transition hover:border-teal-300/60 hover:bg-white/90 ${activeClass}`}
      >
        <span
          className={`rounded-lg p-1.5 ${
            active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="max-w-[9.5rem] whitespace-normal text-xs font-bold leading-snug text-slate-900">
          {name}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/free-tools/${slug}`}
      className={`flex h-[88px] items-start gap-3 rounded-2xl border p-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-teal-300/60 hover:bg-white/90 hover:shadow-md ${activeClass}`}
    >
      <span
        className={`mt-0.5 rounded-lg p-2 ${
          active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="block truncate text-sm font-bold text-slate-900">{name}</span>
        <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-500">
          {shortDescription}
        </span>
      </span>
    </Link>
  );
}

export function FreeToolsSidebar({ activeSlug }: Props) {
  return (
    <>
      <nav aria-label="무료도구 목록 (모바일)" className="min-w-0 lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-950">무료도구 목록</h2>
          <span className="text-xs font-medium text-slate-500">좌우로 스크롤</span>
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {freeTools.map((tool) => (
            <ToolNavLink
              key={tool.slug}
              slug={tool.slug}
              name={tool.name}
              shortDescription={tool.shortDescription}
              icon={tool.icon}
              active={activeSlug === tool.slug}
              variant="mobile"
            />
          ))}
        </div>
      </nav>

      <aside className="hidden min-w-0 lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="mb-3 block">
          <h2 className="text-sm font-bold text-slate-950">무료도구 목록</h2>
          <span className="mt-1 block text-xs font-medium text-slate-500">회원가입 없이 바로 사용</span>
        </div>

        <nav aria-label="무료도구 목록" className="block space-y-2">
          {freeTools.map((tool) => (
            <ToolNavLink
              key={tool.slug}
              slug={tool.slug}
              name={tool.name}
              shortDescription={tool.shortDescription}
              icon={tool.icon}
              active={activeSlug === tool.slug}
              variant="desktop"
            />
          ))}
        </nav>
      </aside>
    </>
  );
}
