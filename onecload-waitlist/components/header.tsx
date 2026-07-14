import { siteConfig } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
        <a href="#top" className="focus-ring text-lg font-bold tracking-[0.08em] text-ink-950">
          {siteConfig.brandEn}
        </a>
        <nav aria-label="주요 메뉴" className="flex items-center gap-2 sm:gap-5">
          <a className="focus-ring hidden text-sm font-medium text-ink-700 hover:text-ink-950 sm:inline" href="#features">
            준비 중인 기능
          </a>
          <a
            className="focus-ring inline-flex min-h-10 items-center justify-center border border-brand-800 bg-brand-800 px-4 text-sm font-semibold text-white hover:bg-brand-900"
            href="#signup"
          >
            개발 소식 받기
          </a>
        </nav>
      </div>
    </header>
  );
}
