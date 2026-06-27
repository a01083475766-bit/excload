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

const LANDING_HERO_VIDEO_START_SECONDS = 0;
const LANDING_HERO_VIDEO_END_OFFSET_SECONDS = 0.2;
const LANDING_HERO_VIDEO_PLAYBACK_RATE = 0.5;

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

function LandingHeroBackgroundVideo() {
  const applyPlaybackSettings = (video: HTMLVideoElement) => {
    video.defaultPlaybackRate = LANDING_HERO_VIDEO_PLAYBACK_RATE;
    video.playbackRate = LANDING_HERO_VIDEO_PLAYBACK_RATE;
  };

  const seekToStart = (video: HTMLVideoElement) => {
    applyPlaybackSettings(video);
    if (video.duration > LANDING_HERO_VIDEO_START_SECONDS) {
      video.currentTime = LANDING_HERO_VIDEO_START_SECONDS;
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden rounded-[2rem] bg-zinc-200 sm:h-[430px] lg:h-[520px]" aria-hidden>
      <video
        className="absolute -inset-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)] max-w-none object-cover opacity-100 brightness-[0.72] contrast-[1.08] saturate-[0.95]"
        muted
        playsInline
        autoPlay
        preload="metadata"
        onLoadedMetadata={(event) => {
          seekToStart(event.currentTarget);
          void event.currentTarget.play().catch(() => undefined);
        }}
        onCanPlay={(event) => {
          applyPlaybackSettings(event.currentTarget);
        }}
        onPlay={(event) => {
          applyPlaybackSettings(event.currentTarget);
        }}
        onRateChange={(event) => {
          if (event.currentTarget.playbackRate !== LANDING_HERO_VIDEO_PLAYBACK_RATE) {
            applyPlaybackSettings(event.currentTarget);
          }
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (
            video.duration > LANDING_HERO_VIDEO_START_SECONDS + LANDING_HERO_VIDEO_END_OFFSET_SECONDS &&
            video.currentTime >= video.duration - LANDING_HERO_VIDEO_END_OFFSET_SECONDS
          ) {
            seekToStart(video);
          }
        }}
        onEnded={(event) => {
          seekToStart(event.currentTarget);
          void event.currentTarget.play().catch(() => undefined);
        }}
      >
        <source src="/landing/videos/quick-order-bg-mobile.mp4" type="video/mp4" media="(max-width: 640px)" />
        <source src="/landing/videos/quick-order-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute -inset-1 bg-blue-950/10 dark:bg-black/35" />
      <div className="absolute -inset-1 bg-gradient-to-b from-white/30 via-white/10 to-zinc-50/25 dark:from-black/55 dark:via-black/25 dark:to-black/55" />
    </div>
  );
}

export default function HomePage() {
  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      priceLabel: '무료',
      priceMain: '0원',
      priceSub: '가입 후 바로 사용',
      description: '무료 이용 플랜',
      features: ['매월 5,000 사용량 제공', '텍스트 입력 최대 5,000자', '엑셀 다운로드 1회 최대 1,000 사용량 차감(잔여가 더 적으면 전액 차감)'],
      popular: false,
    },
    {
      planKey: 'monthly' as const,
      name: '프로',
      priceLabel: '₩4,000 / 월',
      priceMain: '4,000원',
      priceSub: '/ 월',
      description: '꾸준한 주문 처리를 위한 플랜',
      features: ['매월 400,000 사용량 제공', '텍스트 변환 시 글자수만큼 사용량 차감', '엑셀 다운로드 무제한'],
      popular: true,
    },
    {
      planKey: 'yearly' as const,
      name: '연간',
      priceLabel: '₩40,000 / 년',
      priceMain: '40,000원',
      priceSub: '/ 년',
      description: '장기 이용자를 위한 연간 플랜',
      features: ['20% 할인', '매월 400,000 사용량 제공', '엑셀 다운로드 무제한'],
      popular: false,
    },
  ];
  const featureCards = [
    {
      label: '무료체험',
      title: '주문 파일을 올려 바로 확인',
      description: '설명서를 읽기 전에 엑셀 파일이나 카톡 주문문구로 결과를 먼저 확인할 수 있습니다.',
    },
    {
      label: '주문정리',
      title: '쇼핑몰별 주문을 한 파일로',
      description: '스마트스토어, 쿠팡, 오픈마켓 등 서로 다른 주문 형태를 택배사 업로드용으로 정리합니다.',
    },
    {
      label: '송장변환',
      title: '택배사 양식에 맞춰 변환',
      description: '기존에 쓰던 택배사 양식 흐름을 유지하면서 업로드 가능한 파일로 바꿉니다.',
    },
    {
      label: '무료도구',
      title: '작은 작업은 설치 없이 처리',
      description: '이미지 압축, PDF 병합, 엑셀 변환처럼 자주 필요한 작업을 웹에서 바로 처리합니다.',
    },
  ];
  const planComparisonRows = [
    { label: '무료체험', free: '가능', monthly: '가능', yearly: '가능' },
    { label: '월 사용량', free: '5,000', monthly: '400,000', yearly: '400,000' },
    { label: '엑셀 다운로드', free: '차감 방식', monthly: '무제한', yearly: '무제한' },
    { label: '추천 대상', free: '처음 테스트', monthly: '꾸준한 운영', yearly: '장기 이용' },
  ];

  return (
    <div className="landing-soft-font pt-6 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-7xl mx-auto px-3 sm:px-6">
        {/* Hero 섹션 */}
        <section className="blue-unified-theme pt-7 pb-8 lg:pt-12 lg:pb-12">
          <div className="relative z-10 flex flex-col gap-8">
            <div className="relative isolate mx-auto mb-6 w-full max-w-6xl overflow-hidden rounded-[2rem] bg-zinc-200 px-4 py-12 text-center sm:mb-12 sm:px-8 lg:mb-14 lg:py-16">
              <LandingHeroBackgroundVideo />
              <div className="relative z-10">
              <p className="text-sm font-bold tracking-[0.28em] text-blue-600 dark:text-blue-400">EXCLOAD</p>
              <h1 className="mt-4 text-[clamp(1.47rem,4.2vw,3.36rem)] font-black leading-tight tracking-tight text-zinc-950 dark:text-zinc-100 [word-break:keep-all]">
                복잡한 기능은 빼고
                <br />
                <span className="text-blue-600 dark:text-blue-400">&quot;빠른 주문 정리&quot;</span>
              </h1>
              <p className="mx-auto mt-6 max-w-3xl rounded-2xl bg-white/42 px-4 py-3 text-lg font-bold leading-relaxed text-zinc-950 shadow-sm backdrop-blur-[2px] dark:bg-black/28 dark:text-zinc-100 sm:px-5 sm:text-xl [word-break:keep-all]">
                복잡한 설정 없이, 내려받은 주문 파일을 그대로 올려보세요.
                <br />
                택배사 양식에 맞는 파일로 빠르게 정리됩니다.
              </p>
              <div className="mx-auto mt-7 flex max-w-3xl items-center gap-3 rounded-2xl border border-white/70 bg-white/72 px-5 py-4 text-left shadow-[0_14px_40px_rgba(37,99,235,0.10)] backdrop-blur-sm dark:border-blue-900/70 dark:bg-zinc-900/72 sm:px-6">
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
            </div>

            <div className="flex flex-col items-center text-center max-w-3xl mx-auto px-3 pt-2 pb-2 lg:pt-4">
              <p className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                복잡한 주문 정리, 먼저 무료로 테스트해보세요.
                <br className="hidden sm:block" />
                마음에 들면{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">월 4,000원</span>으로 계속 사용할 수 있습니다.
              </p>
            </div>

            {/* 홈에서도 바로 체험 가능: 기존 /trial 페이지는 그대로 유지 */}
            <div className="w-full">
              <TrialEmbed trialMode landingEmbed />
              <p className="mt-2 text-center text-sm sm:text-base text-zinc-500 dark:text-zinc-500 leading-snug">
                파일 업로드가 부담되면 카톡 주문문구를 붙여넣어도 테스트할 수 있습니다.{' '}
                <Link href="/trial" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                  전체 화면 체험
                </Link>
                {' · '}
                <Link
                  href="/invoice-file-convert/trial"
                  className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  송장변환 체험
                </Link>
                도 사용할 수 있습니다.
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

            <div className="mx-auto max-w-4xl px-3 pt-16 pb-8 text-center lg:pt-20 lg:pb-10">
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

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-3">
            <div className="mb-8 text-center lg:mb-10">
              <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
                EXCLOAD FEATURES
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-3xl">
                필요한 기능만 한눈에 보이게
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
                쇼핑몰 운영자가 실제로 자주 쓰는 흐름만 남겨, 처음 들어와도 어디를 눌러야 할지 바로 알 수 있게 정리했습니다.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featureCards.map((feature, index) => (
                <article
                  key={feature.label}
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900 ${
                    index === 0
                      ? 'border-blue-500 ring-1 ring-blue-100 dark:border-blue-600 dark:ring-blue-950'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                      index === 0
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {feature.label}
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold leading-snug text-zinc-950 dark:text-zinc-100 [word-break:keep-all]">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 [word-break:keep-all]">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <LandingPrePricingCta />

        {/* 가격 섹션 */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
                PRICE PLAN
              </p>
              <h2 className="mt-3 text-2xl font-black text-zinc-950 dark:text-zinc-100 sm:text-3xl">
                무료로 먼저 써보고, 필요할 때만 업그레이드
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
                핵심 차이만 빠르게 볼 수 있게 카드와 비교표로 정리했습니다.
              </p>
              <div className="mx-auto mt-6 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                추천: 먼저 무료체험으로 결과 확인
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
              {plans.map((plan) => (
                <div
                  key={plan.planKey}
                  className={`relative flex min-h-[360px] flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-zinc-900 ${
                    plan.popular ? 'border-blue-500 ring-1 ring-blue-100 dark:ring-blue-950' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                      인기 플랜
                    </div>
                  )}

                  <div className="text-center">
                    <h3 className="text-xl font-extrabold text-zinc-950 dark:text-zinc-100">{plan.name}</h3>
                    <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {plan.description}
                    </p>
                    <div className="mt-5 flex items-end justify-center gap-1 text-zinc-950 dark:text-zinc-100">
                      <span className="text-3xl font-black tracking-tight">{plan.priceMain}</span>
                      <span className="pb-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{plan.priceSub}</span>
                    </div>
                  </div>

                  <ul className="mt-7 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <Check className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/subscribe?plan=${encodeURIComponent(plan.planKey)}`}
                    className={`mt-7 block w-full rounded-lg px-4 py-3 text-center text-sm font-bold transition ${
                      plan.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
                    }`}
                  >
                    {plan.planKey === 'free' ? '무료체험 사용해보기' : `${plan.name} 시작하기`}
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-10 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-4 bg-zinc-50 text-center text-sm font-bold text-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200">
                  <div className="px-3 py-3 text-left">비교 항목</div>
                  <div className="px-3 py-3">무료</div>
                  <div className="px-3 py-3">프로</div>
                  <div className="px-3 py-3">연간</div>
                </div>
                {planComparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-4 border-t border-zinc-100 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <div className="px-3 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">{row.label}</div>
                    <div className="px-3 py-3">{row.free}</div>
                    <div className="px-3 py-3 font-semibold text-blue-700 dark:text-blue-300">{row.monthly}</div>
                    <div className="px-3 py-3">{row.yearly}</div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-zinc-500">
              표시된 금액과 제공량은 현재 서비스 기준입니다. 자세한 결제 조건은 가격 페이지에서 확인하세요.
            </p>
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
