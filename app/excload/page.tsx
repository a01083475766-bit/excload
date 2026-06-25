'use client';

import {
  LandingHowToSteps,
  LandingPrePricingCta,
  LandingWhyHowCarriers,
} from '@/app/components/landing/LandingReferenceSections';
import { InvoiceFileConvertTrialModeProvider } from '@/app/invoice-file-convert/trial-mode-context';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
const TrialEmbed = dynamic(
  () =>
    import('@/app/logistics-convert/LogisticsConvertClient').then(
      (mod) => mod.LogisticsConvertClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        무료체험 화면을 불러오는 중입니다...
      </div>
    ),
  },
);
const InvoiceTrialEmbed = dynamic(() => import('@/app/invoice-file-convert/page'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      송장변환 체험 화면을 불러오는 중입니다...
    </div>
  ),
});

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

export default function HomePage() {
  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      priceLabel: '무료',
      description: '무료 이용 플랜',
      features: ['매월 5,000 사용량 제공', '텍스트 입력 최대 5,000자', '엑셀 다운로드 1회 최대 1,000 사용량 차감(잔여가 더 적으면 전액 차감)'],
      popular: false,
    },
    {
      planKey: 'monthly' as const,
      name: '프로',
      priceLabel: '₩4,000 / 월',
      description: '꾸준한 주문 처리를 위한 플랜',
      features: ['매월 400,000 사용량 제공', '텍스트 변환 시 글자수만큼 사용량 차감', '엑셀 다운로드 무제한'],
      popular: true,
    },
    {
      planKey: 'yearly' as const,
      name: '연간',
      priceLabel: '₩40,000 / 년',
      description: '장기 이용자를 위한 연간 플랜',
      features: ['20% 할인', '매월 400,000 사용량 제공', '엑셀 다운로드 무제한'],
      popular: false,
    },
  ];

  return (
    <div className="landing-soft-font pt-6 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-7xl mx-auto px-6">
        {/* Hero 섹션 */}
        <section className="blue-unified-theme pt-12 pb-8 lg:pt-20 lg:pb-12">
          <div className="flex flex-col gap-8">
            <div className="relative mx-auto mb-28 max-w-5xl text-center lg:mb-36">
              <p className="text-sm font-bold tracking-[0.28em] text-blue-600 dark:text-blue-400">EXCLOAD</p>
              <h1 className="mt-4 text-[clamp(1.47rem,4.2vw,3.36rem)] font-black leading-tight tracking-tight text-zinc-950 dark:text-zinc-100 [word-break:keep-all]">
                복잡한 기능은 빼고
                <br />
                <span className="text-blue-600 dark:text-blue-400">&quot;빠른 주문 정리&quot;</span>
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-lg font-semibold leading-relaxed text-zinc-800 dark:text-zinc-200 sm:text-xl [word-break:keep-all]">
                복잡한 설정 없이, 내려받은 주문 파일을 그대로 올려보세요.
                <br />
                택배사 양식에 맞는 파일로 빠르게 정리됩니다.
              </p>
              <div className="mx-auto mt-7 flex max-w-3xl items-center gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 text-left shadow-[0_14px_40px_rgba(37,99,235,0.10)] dark:border-blue-900/70 dark:bg-zinc-900 sm:px-6">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                  <Check className="h-5 w-5" />
                </span>
                <p className="text-base font-semibold leading-snug text-zinc-700 dark:text-zinc-200 sm:text-lg [word-break:keep-all]">
                  양식이 다른 여러 파일을 올려도{' '}
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">
                    자동으로 하나의 파일로 변환
                  </span>
                  됩니다.
                </p>
              </div>
            </div>

            <div className="mx-auto grid w-full max-w-6xl items-start gap-4 lg:grid-cols-[210px_minmax(0,1024px)]">
              <div className="space-y-3 pt-10 lg:pt-16">
                <div className="grid grid-cols-2 gap-2">
                  {shoppingMallCards.map((mall) => (
                    <div
                      key={mall.name}
                      className="flex min-h-[54px] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-2 py-2 text-center shadow-sm"
                    >
                      <ShoppingMallBrand type={mall.key} />
                      <span className="mt-1 text-[12px] font-black leading-none text-black [word-break:keep-all]">
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

                <div className="space-y-1.5 pt-4 lg:pt-5">
                  {courierCards.map((courier) => (
                    <div
                      key={courier.name}
                      className="flex min-h-[32px] items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-sm"
                    >
                      <span
                        className="w-[46px] shrink-0 text-center text-[11px] font-black leading-none tracking-tight"
                        style={{ color: courier.color }}
                      >
                        {courier.logo}
                      </span>
                      <span className="text-center text-[12px] font-black text-black [word-break:keep-all]">
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
                priority
                unoptimized
                className="ml-auto h-auto w-full max-w-[1024px]"
              />
            </div>

            <div className="mx-auto max-w-4xl px-3 pt-28 text-center lg:pt-32">
              <h2 className="text-3xl font-extrabold leading-snug text-zinc-950 dark:text-zinc-100 sm:text-4xl [word-break:keep-all]">
                주문 확인은 그대로,
                <br />
                파일 정리는 더 간단하게.
              </h2>
              <p className="mt-5 text-lg font-semibold leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-xl [word-break:keep-all]">
                내려받은 주문 엑셀을 택배사 양식에 맞춰 전달하면 됩니다.
              </p>
              <p className="mt-2 text-lg font-semibold leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-xl [word-break:keep-all]">
                복잡한 주문관리 프로그램을 새로 배울 필요가 없습니다.
              </p>
            </div>

            {/* 데모 하단: 가격 강조 (한 줄) — 상하 여백 대칭, 아래 체험 박스와 간격 확보 */}
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto px-3 py-8 lg:py-10">
              <p className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                비싼 프로그램은 부담스럽고 주문 정리가 힘들다면, 부담을 줄여 보세요 —{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">월 4,000원</span> 엑클로드.
              </p>
            </div>

            {/* 홈에서도 바로 체험 가능: 기존 /trial 페이지는 그대로 유지 */}
            <div className="w-full">
              <TrialEmbed trialMode landingEmbed />
              <p className="mt-2 text-center text-sm sm:text-base text-zinc-500 dark:text-zinc-500 leading-snug">
                전체 화면이 필요하면{' '}
                <Link href="/trial" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                  체험 전용 페이지
                </Link>
                로 이동할 수 있습니다.
              </p>
              <p className="mt-1 text-center text-sm sm:text-base text-zinc-500 dark:text-zinc-500 leading-snug">
                송장변환도 테스트하려면{' '}
                <Link
                  href="/invoice-file-convert/trial"
                  className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  송장변환 체험 페이지
                </Link>
                에서 확인할 수 있습니다.
              </p>
              <div className="mt-8 w-full">
                <div className="invoice-native-theme">
                  <InvoiceFileConvertTrialModeProvider trialMode>
                    <InvoiceTrialEmbed />
                  </InvoiceFileConvertTrialModeProvider>
                </div>
                <p className="mt-2 text-center text-sm sm:text-base text-zinc-500 dark:text-zinc-500 leading-snug">
                  송장변환 전체 화면이 필요하면{' '}
                  <Link
                    href="/invoice-file-convert/trial"
                    className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    송장변환 체험 전용 페이지
                  </Link>
                  로 이동할 수 있습니다.
                </p>
              </div>
            </div>

            {/* 기존 데모 애니메이션 자리 — 3단계 안내 (참고 랜딩) */}
            <div className="w-full pt-12 pb-4 lg:pt-16 lg:pb-6">
              <div className="mx-auto w-full max-w-6xl">
                <div className="rounded-2xl border border-blue-200 bg-white/90 p-5 shadow-sm dark:border-blue-900 dark:bg-zinc-900/90 md:p-7 lg:p-8">
                  <LandingHowToSteps variant="embedded" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingWhyHowCarriers />

        {/* 설명 텍스트 섹션 — 콜론(:) 세로 정렬 (Grid 3열), 여백·줄간격 타이트 */}
        <section className="py-6 lg:py-8">
          <div className="max-w-4xl mx-auto px-3 space-y-3">
            <h2 className="text-center text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
              주문 정리, 이렇게 돕습니다
            </h2>
            <div className="flex justify-center">
              <div className="grid w-fit max-w-full min-w-0 grid-cols-[max-content_auto_minmax(8rem,max-content)] gap-x-2 gap-y-2 text-left text-sm sm:gap-x-3 sm:text-base leading-snug text-zinc-600 dark:text-zinc-400">
                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  어떤 방식의 주문도
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  카톡·엑셀·스크린샷 등, 받은 형태 그대로 다룰 수 있습니다
                </div>

                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  나만의 양식으로 전환
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  새 양식을 만들기보다, 지금 쓰는 업로드 양식에 맞춰 드립니다
                </div>

                <div className="text-right font-semibold text-zinc-800 dark:text-zinc-200 [word-break:keep-all]">
                  배울 필요 없는 흐름
                </div>
                <div className="shrink-0 px-0.5 text-center font-semibold text-zinc-800 dark:text-zinc-200">
                  :
                </div>
                <div className="min-w-0 text-left [word-break:keep-all]">
                  복사(Ctrl+C)와 붙여넣기(Ctrl+V)로 이어지는 주문 정리
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingPrePricingCta />

        {/* 가격 섹션 */}
        <section className="py-16 lg:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">가격 플랜</h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                요금과 사용 조건을 한눈에 비교해 보고 선택하세요.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.planKey}
                  className={`relative p-6 rounded-2xl border-2 bg-white dark:bg-zinc-900 shadow-lg transition-all ${
                    plan.popular ? 'border-blue-500' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                      인기 플랜
                    </div>
                  )}

                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 text-center">{plan.name}</h3>
                  <p className="text-center text-zinc-600 dark:text-zinc-400 text-sm mb-3">{plan.description}</p>
                  <p className="text-center text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-5">{plan.priceLabel}</p>

                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Check className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/subscribe?plan=${encodeURIComponent(plan.planKey)}`}
                    className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {plan.planKey === 'free' ? '무료체험 사용해보기' : `${plan.name} 시작하기`}
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-zinc-500">자세한 비교는 가격 페이지에서 확인하세요.</p>
            <div className="mt-3 text-center">
              <Link href="/pricing" className="text-sm text-blue-700 dark:text-blue-400 hover:underline underline-offset-2">
                가격 페이지 전체 보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
