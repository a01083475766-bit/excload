'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import Image from 'next/image';
import Link from 'next/link';

type ShoppingMallKey = 'naver' | 'eleven' | 'coupang' | 'gmarket' | 'auction' | 'cafe24';
type CourierKey = 'cj' | 'logen' | 'post' | 'hanjin' | 'lotte' | 'kydexp';

const shoppingMallCards: { key: ShoppingMallKey; name: string }[] = [
  { key: 'naver', name: '스마트스토어' },
  { key: 'eleven', name: '11번가' },
  { key: 'coupang', name: '쿠팡' },
  { key: 'gmarket', name: 'G마켓' },
  { key: 'auction', name: '옥션' },
  { key: 'cafe24', name: '카페24' },
];

const courierCards: { key: CourierKey; name: string; logo: string; color: string }[] = [
  { key: 'cj', name: 'CJ대한통운', logo: 'CJ', color: '#0f5ca8' },
  { key: 'logen', name: '로젠택배', logo: 'LOGEN', color: '#b07a1f' },
  { key: 'post', name: '우체국택배', logo: 'POST', color: '#dc2626' },
  { key: 'hanjin', name: '한진택배', logo: 'HANJIN', color: '#0f75bc' },
  { key: 'lotte', name: '롯데택배', logo: 'LOTTE', color: '#dc2626' },
  { key: 'kydexp', name: '경동택배', logo: 'KYDEXP', color: '#138f45' },
];

function ShoppingMallBrand({ type }: { type: ShoppingMallKey }) {
  if (type === 'naver') {
    return <span className="text-[16px] font-black leading-none tracking-tight text-[#03c75a]">NAVER</span>;
  }
  if (type === 'eleven') {
    return <span className="text-[20px] font-black leading-none tracking-tight text-[#ef3340]">11&gt;</span>;
  }
  if (type === 'coupang') {
    return (
      <span className="text-[14px] font-black leading-none tracking-tight">
        <span className="text-[#6b1d1d]">cou</span>
        <span className="text-[#f59e0b]">p</span>
        <span className="text-[#16a34a]">a</span>
        <span className="text-[#2563eb]">n</span>
        <span className="text-[#38bdf8]">g</span>
      </span>
    );
  }
  if (type === 'gmarket') {
    return (
      <span className="text-[15px] font-black leading-none tracking-tight">
        <span className="text-[#00b050]">G</span>
        <span className="text-[#1d4ed8]">market</span>
      </span>
    );
  }
  if (type === 'auction') {
    return <span className="text-[17px] font-black leading-none text-[#c1121f]">옥션</span>;
  }
  return (
    <span className="text-[16px] font-black leading-none tracking-tight">
      <span className="text-[#111827]">cafe</span>
      <span className="text-[#0ea5e9]">24</span>
    </span>
  );
}

function MallCourierPanel() {
  return (
    <div className="grid w-full items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {shoppingMallCards.map((mall) => (
            <div
              key={mall.name}
              className="flex min-h-[54px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <ShoppingMallBrand type={mall.key} />
              <span className="mt-1 text-[12px] font-black leading-none text-black dark:text-zinc-100 [word-break:keep-all]">
                {mall.name}
              </span>
            </div>
          ))}
        </div>

        <div className="flex h-[92px] flex-col items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 via-teal-700 to-blue-900 px-3 text-center shadow-sm">
          <p className="text-[15px] font-black leading-tight text-amber-200 [word-break:keep-all]">
            여러 쇼핑몰 주문을
          </p>
          <p className="mt-1 text-[15px] font-black leading-tight text-amber-200 [word-break:keep-all]">
            택배사 양식으로 정리
          </p>
        </div>

        <div className="space-y-1.5">
          {courierCards.map((courier) => (
            <div
              key={courier.name}
              className="flex min-h-[32px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span
                className="w-[46px] shrink-0 text-center text-[11px] font-black leading-none tracking-tight"
                style={{ color: courier.color }}
              >
                {courier.logo}
              </span>
              <span className="text-center text-[12px] font-black text-black dark:text-zinc-100 [word-break:keep-all]">
                {courier.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Image
        src="/landing/quick-order-preview2.png"
        alt="엑클로드 빠른 주문 정리 화면 미리보기"
        width={1024}
        height={576}
        unoptimized
        className="h-auto w-full rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800"
      />
    </div>
  );
}

const stories = [
  {
    id: 'file',
    eyebrow: '파일 정리',
    title: '복잡한 주문관리 없이, 파일만 정리',
    desc: '내려받은 주문 엑셀이나 카톡 주문문구를 택배사 업로드용 파일로 바꿉니다. 새 프로그램을 배울 필요 없이 결과부터 확인할 수 있습니다.',
    visual: 'preview' as const,
    cta: { href: '#free-trial', label: '주문정리 체험하기' },
    reverse: false,
  },
  {
    id: 'order-link',
    eyebrow: '주문연동',
    title: '쇼핑몰 주문을 가져와 한 흐름으로',
    desc: '스마트스토어, 쿠팡, 오픈마켓 등 여러 채널 주문을 연동해 파일 정리 흐름과 이어갑니다. 오픈 베타 참여자는 주문연동을 우선 이용할 수 있습니다.',
    visual: 'mall' as const,
    cta: { href: '/auth', label: '오픈 베타 가입' },
    reverse: true,
  },
  {
    id: 'invoice',
    eyebrow: '송장·물류',
    title: '택배사·물류 양식에 맞춰 변환',
    desc: '기존에 쓰던 택배사 양식 흐름을 유지하면서 출고 결과와 송장 파일을 업로드 가능한 형태로 바꿉니다.',
    visual: 'invoice' as const,
    cta: { href: '#free-trial', label: '송장변환 체험하기' },
    reverse: false,
  },
] as const;

export default function LandingTestFeatureStories() {
  return (
    <section id="features" className="scroll-mt-24 py-8 lg:py-11">
      <div className={landingContainerClass}>
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            EXCLOAD WORKFLOW
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-3xl">
            주문 확인은 그대로, 파일 정리는 더 간단하게
          </h2>
        </div>

        <div className="space-y-16 lg:space-y-24">
          {stories.map((story) => (
            <article
              key={story.id}
              className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-12 ${
                story.reverse ? 'lg:[&>div:first-child]:order-2' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.18em] text-blue-600 dark:text-blue-400">
                  {story.eyebrow}
                </p>
                <h3 className="mt-3 text-xl font-extrabold leading-snug text-zinc-950 dark:text-zinc-100 sm:text-2xl [word-break:keep-all]">
                  {story.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 [word-break:keep-all]">
                  {story.desc}
                </p>
                <Link
                  href={story.cta.href}
                  className="mt-6 inline-flex text-sm font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  {story.cta.label} →
                </Link>
              </div>

              <div className="min-w-0">
                {story.visual === 'mall' ? (
                  <MallCourierPanel />
                ) : story.visual === 'preview' ? (
                  <Image
                    src="/landing/quick-order-preview.png"
                    alt="엑클로드 주문 정리 화면"
                    width={1024}
                    height={576}
                    unoptimized
                    className="h-auto w-full rounded-2xl border border-zinc-200 shadow-lg dark:border-zinc-800"
                  />
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-blue-50 p-6 shadow-lg dark:border-zinc-800 dark:from-zinc-900 dark:to-blue-950/30">
                    <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400">송장·물류 파일 변환</p>
                    <p className="mt-2 text-lg font-extrabold text-zinc-900 dark:text-zinc-100 [word-break:keep-all]">
                      CJ · 롯데 · 한진 · 로젠 양식 지원
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 [word-break:keep-all]">
                      출고 결과 엑셀을 택배사·물류사 업로드 형식으로 변환합니다. 아래 체험 탭에서 송장변환을 바로
                      테스트할 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
