'use client';

import LandingHeroSection from '@/app/components/landing/LandingHeroSection';
import { OpenBetaLandingBottom, OpenBetaLandingTop } from '@/app/components/landing/OpenBetaLandingSections';
import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { InvoiceFileConvertTrialModeProvider } from '@/app/invoice-file-convert/trial-mode-context';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import dynamic from 'next/dynamic';
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
      <div className="w-full border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        무료 테스트 화면을 불러오는 중입니다...
      </div>
    ),
  },
);
const InvoiceTrialEmbed = dynamic(() => import('@/app/invoice-file-convert/page'), {
  ssr: false,
  loading: () => (
    <div className="w-full border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      송장변환 테스트 화면을 불러오는 중입니다...
    </div>
  ),
});

export default function HomePage() {
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();

  const plans = betaMode
    ? [
        {
          planKey: 'free' as const,
          name: '오픈 베타',
          priceMain: '무료',
          priceSub: '가입 후 바로 사용',
          description: '회원가입만 하면 주요 기능을 무료로 사용할 수 있습니다',
          features: [
            `회원가입 시 ${signupBonusLabel}P 제공`,
            `매월 ${signupBonusLabel} 포인트 사용량 제공`,
            '엑셀 다운로드 무제한 가능',
            '텍스트 변환 시 글자 수만큼 포인트 차감',
            '자동 유료 전환 없음',
          ],
          popular: true,
          upcoming: false,
        },
        {
          planKey: 'monthly' as const,
          name: '프로',
          priceMain: '4,000원',
          priceSub: '/ 월',
          description: '꾸준한 주문 처리를 위한 플랜 (정식 출시 예정)',
          features: [
            '매월 400,000 포인트 제공',
            '텍스트 변환 시 글자 수만큼 포인트 차감',
            '엑셀 다운로드 무제한',
          ],
          popular: false,
          upcoming: true,
        },
        {
          planKey: 'yearly' as const,
          name: '연간',
          priceMain: '40,000원',
          priceSub: '/ 년',
          description: '장기 이용자를 위한 연간 플랜 (정식 출시 예정)',
          features: ['20% 할인', '매월 400,000 포인트 제공', '엑셀 다운로드 무제한'],
          popular: false,
          upcoming: true,
        },
      ]
    : [
        {
          planKey: 'free' as const,
          name: '무료',
          priceMain: '0원',
          priceSub: '가입 후 바로 사용',
          description: '무료 이용 플랜',
          features: [
            '매월 5,000 포인트 제공',
            '텍스트 입력 최대 5,000자',
            '엑셀 다운로드 1회 최대 1,000 포인트 차감',
          ],
          popular: false,
          upcoming: false,
        },
        {
          planKey: 'monthly' as const,
          name: '프로',
          priceMain: '4,000원',
          priceSub: '/ 월',
          description: '꾸준한 주문 처리를 위한 플랜',
          features: [
            '매월 400,000 포인트 제공',
            '텍스트 변환 시 글자 수만큼 포인트 차감',
            '엑셀 다운로드 무제한',
          ],
          popular: true,
          upcoming: false,
        },
        {
          planKey: 'yearly' as const,
          name: '연간',
          priceMain: '40,000원',
          priceSub: '/ 년',
          description: '장기 이용자를 위한 연간 플랜',
          features: ['20% 할인', '매월 400,000 포인트 제공', '엑셀 다운로드 무제한'],
          popular: false,
          upcoming: false,
        },
      ];

  const planComparisonRows = betaMode
    ? [
        { label: '오픈 베타', free: '가능', monthly: '—', yearly: '—' },
        { label: '월 포인트', free: `${signupBonusLabel}P`, monthly: '400,000P', yearly: '400,000P' },
        { label: '엑셀 다운로드', free: '무제한', monthly: '무제한', yearly: '무제한' },
        { label: '추천 대상', free: '베타 이용', monthly: '정식 출시 후', yearly: '정식 출시 후' },
      ]
    : [
        { label: '무료체험', free: '가능', monthly: '가능', yearly: '가능' },
        { label: '월 포인트', free: '5,000', monthly: '400,000', yearly: '400,000' },
        { label: '엑셀 다운로드', free: '차감 방식', monthly: '무제한', yearly: '무제한' },
        { label: '추천 대상', free: '처음 테스트', monthly: '꾸준한 운영', yearly: '장기 이용' },
      ];

  return (
    <div className="landing-soft-font min-h-screen bg-zinc-50 pt-6 dark:bg-black">
      <LandingHeroSection />

      {betaMode ? <OpenBetaLandingTop /> : null}

      <section
        id="free-trial"
        className="scroll-mt-24 border-b border-zinc-200 bg-white py-10 dark:border-zinc-800 dark:bg-zinc-950 sm:py-12"
      >
        <div className={landingContainerClass}>
          <div className="max-w-2xl">
            <h2 className="break-keep text-xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-2xl">
              무료 테스트
            </h2>
            <p className="mt-2 break-keep text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              가입 전에 주문 파일이나 카톡 주문문구로 변환 결과를 바로 확인해 보세요.
            </p>
          </div>

          <div className="mt-6 w-full">
            <TrialEmbed trialMode landingEmbed />
            <p className="mt-2 text-center text-sm text-zinc-500">
              파일 업로드가 부담되면 카톡 주문문구를 붙여넣어도 테스트할 수 있습니다.{' '}
              <Link
                href="/trial"
                className="text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
              >
                전체 화면 체험
              </Link>
              {' · '}
              <Link
                href="/invoice-file-convert/trial"
                className="text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
              >
                송장변환 체험
              </Link>
            </p>

            <div className="invoice-native-theme mt-8 w-full">
              <InvoiceFileConvertTrialModeProvider trialMode>
                <InvoiceTrialEmbed />
              </InvoiceFileConvertTrialModeProvider>
            </div>
            <p className="mt-2 text-center text-sm text-zinc-500">
              송장변환 전체 화면이 필요하면{' '}
              <Link
                href="/invoice-file-convert/trial"
                className="text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400"
              >
                송장변환 체험 전용 페이지
              </Link>
              로 이동할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {betaMode ? <OpenBetaLandingBottom /> : null}

      <section id="pricing" className="bg-zinc-50 py-12 dark:bg-black sm:py-16">
        <div className={`${landingContainerClass} max-w-6xl`}>
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600">PRICE PLAN</p>
            <h2 className="mt-2 break-keep text-xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-2xl">
              {betaMode
                ? '오픈 베타 기간에는 무료로 이용할 수 있습니다'
                : '무료로 먼저 써보고, 필요할 때만 업그레이드'}
            </h2>
            <p className="mt-2 break-keep text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {betaMode ? (
                <>
                  회원가입 시 {signupBonusLabel}P · 매월 {signupBonusLabel} 포인트 사용량을 제공합니다.
                  아래 유료 요금제는 정식 출시 후 적용될 예상 요금입니다.
                </>
              ) : (
                '핵심 차이만 빠르게 볼 수 있게 정리했습니다.'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.planKey}
                className={`flex flex-col border bg-white p-5 dark:bg-zinc-950 ${
                  plan.popular
                    ? 'border-blue-600 dark:border-blue-500'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                {plan.upcoming ? (
                  <p className="mb-2 text-[11px] font-semibold text-zinc-500">정식 출시 예정</p>
                ) : null}
                <h3 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">{plan.name}</h3>
                <p className="mt-2 min-h-[2.5rem] text-sm text-zinc-500">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1 text-zinc-950 dark:text-zinc-50">
                  <span className="text-2xl font-bold tracking-tight">{plan.priceMain}</span>
                  <span className="pb-0.5 text-sm text-zinc-500">{plan.priceSub}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {plan.upcoming ? (
                  <button
                    type="button"
                    disabled
                    className="mt-6 w-full cursor-not-allowed border border-zinc-200 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-500"
                  >
                    출시 예정
                  </button>
                ) : (
                  <Link
                    href={
                      betaMode && plan.planKey === 'free'
                        ? '/auth/signup'
                        : `/subscribe?plan=${encodeURIComponent(plan.planKey)}`
                    }
                    className={`mt-6 block w-full rounded-md px-4 py-2.5 text-center text-sm font-semibold ${
                      plan.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-950'
                    }`}
                  >
                    {plan.planKey === 'free'
                      ? betaMode
                        ? '오픈 베타 참여하기'
                        : '무료체험 사용해보기'
                      : `${plan.name} 시작하기`}
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-4 bg-zinc-50 text-center text-sm font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <div className="px-3 py-3 text-left">비교 항목</div>
                <div className="px-3 py-3">{betaMode ? '오픈 베타' : '무료'}</div>
                <div className="px-3 py-3">프로</div>
                <div className="px-3 py-3">연간</div>
              </div>
              {planComparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-4 border-t border-zinc-100 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
                >
                  <div className="px-3 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                    {row.label}
                  </div>
                  <div className="px-3 py-3">{row.free}</div>
                  <div className="px-3 py-3 font-semibold text-blue-700 dark:text-blue-300">
                    {row.monthly}
                  </div>
                  <div className="px-3 py-3">{row.yearly}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-zinc-500">
            {betaMode
              ? '현재 표시된 유료 요금제는 정식 출시 후 적용될 예상 요금입니다.'
              : '표시된 금액과 제공량은 현재 서비스 기준입니다.'}{' '}
            <Link href="/pricing" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
              가격 페이지 전체 보기
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
