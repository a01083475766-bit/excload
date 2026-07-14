import { siteConfig } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-white py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 text-sm text-ink-700 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <p className="font-bold tracking-[0.08em] text-ink-950">{siteConfig.brandEn}</p>
          <p className="mt-2">온라인 판매자의 반복 주문 업무를 줄이는 기능을 준비하고 있습니다.</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <p>개인정보 처리 안내 · 준비 중</p>
        </div>
      </div>
    </footer>
  );
}
