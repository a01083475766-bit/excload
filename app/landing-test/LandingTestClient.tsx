'use client';

import {
  LandingHowToSteps,
  LandingPrePricingCta,
  LandingWhyHowCarriers,
} from '@/app/components/landing/LandingReferenceSections';
import { landingContainerClass } from '@/app/components/landing/landingLayout';
import LandingTestFeatureStories from '@/app/landing-test/LandingTestFeatureStories';
import LandingTestHeroSection from '@/app/landing-test/LandingTestHeroSection';
import LandingTestOpenBetaBenefits from '@/app/landing-test/LandingTestOpenBetaBenefits';
import LandingTestTrialSection from '@/app/landing-test/LandingTestTrialSection';
import LandingTestWorkflowSection from '@/app/landing-test/LandingTestWorkflowSection';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import Link from 'next/link';
import { Check } from 'lucide-react';

/**
 * 관리자 전용 랜딩 테스트본 (/landing-test).
 * 여기서 실험·확정한 뒤, 운영 랜딩(/excload)에만 반영하세요.
 */
export default function LandingTestPage() {
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
            '쇼핑몰 주문연동 오픈 베타 이용',
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
            '엑셀 다운로드 1회 최대 1,000 포인트 차감(잔여가 더 적으면 전액 차감)',
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

  const featureCards = [
    {
      label: '무료체험',
      title: '주문 파일을 올려 바로 확인',
      description: '설명서를 읽기 전에 엑셀 파일이나 카톡 주문문구로 결과를 먼저 확인할 수 있습니다.',
    },
    {
      label: '주문연동',
      title: '쇼핑몰 주문을 한 흐름으로',
      description: '스마트스토어, 쿠팡, 오픈마켓 주문을 가져와 파일 정리와 이어서 처리합니다.',
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

  const planComparisonRows = betaMode
    ? [
        { label: '오픈 베타', free: '가능', monthly: '—', yearly: '—' },
        { label: '주문연동', free: '오픈 베타', monthly: '—', yearly: '—' },
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
    <div className="landing-soft-font min-h-screen bg-zinc-50 pt-[3.15rem] dark:bg-black">
      <LandingTestHeroSection />
      <LandingTestOpenBetaBenefits />

      <main className={landingContainerClass}>
        <LandingTestFeatureStories />
        <LandingTestTrialSection />
        <LandingTestWorkflowSection />

        <section className="py-10 lg:py-14">
          <div className="mx-auto w-full max-w-6xl">
            <div className="rounded-2xl border border-blue-200 bg-white/90 p-5 shadow-sm dark:border-blue-900 dark:bg-zinc-900/90 md:p-7 lg:p-8">
              <LandingHowToSteps variant="embedded" />
            </div>
          </div>
        </section>

        <LandingWhyHowCarriers />

        <section className="py-8 lg:py-11">
          <div className="mx-auto max-w-6xl px-3">
            <div className="mb-8 text-center lg:mb-10">
              <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
                EXCLOAD FEATURES
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-3xl">
                필요한 기능만 한눈에 보이게
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
                쇼핑몰 운영자가 실제로 자주 쓰는 흐름만 남겨, 처음 들어와도 어디를 눌러야 할지 바로 알 수 있게
                정리했습니다.
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

        <section className="py-11 lg:py-[4.2rem]">
          <div className="mx-auto max-w-6xl">
            <div className="mb-7 text-center">
              <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
                PRICE PLAN
              </p>
              <h2 className="mt-3 text-2xl font-black text-zinc-950 dark:text-zinc-100 sm:text-3xl">
                {betaMode
                  ? '오픈 베타 기간에는 무료로 이용할 수 있습니다'
                  : '무료로 먼저 써보고, 필요할 때만 업그레이드'}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
                {betaMode ? (
                  <>
                    회원가입 시 {signupBonusLabel}P를 제공하고, 베타 기간에는 매월 {signupBonusLabel} 포인트
                    사용량을 제공합니다. 주문연동·파일 변환을 무료로 먼저 이용해 보세요.
                  </>
                ) : (
                  '핵심 차이만 빠르게 볼 수 있게 카드와 비교표로 정리했습니다.'
                )}
              </p>
              {betaMode ? (
                <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-500">
                  현재 표시된 유료 요금제는 정식 출시 후 적용될 예상 요금입니다. 오픈 베타 이용자는 자동으로 유료
                  전환되지 않습니다.
                </p>
              ) : (
                <div className="mx-auto mt-6 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                  추천: 먼저 무료체험으로 결과 확인
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
              {plans.map((plan) => (
                <div
                  key={plan.planKey}
                  className={`relative flex min-h-[360px] flex-col rounded-2xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-zinc-900 ${
                    plan.popular
                      ? 'border-blue-500 ring-1 ring-blue-100 dark:ring-blue-950'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                      {betaMode ? '오픈 베타' : '인기 플랜'}
                    </div>
                  )}
                  {plan.upcoming ? (
                    <div className="mb-2 self-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      정식 출시 예정
                    </div>
                  ) : null}

                  <div className="text-center">
                    <h3 className="text-xl font-extrabold text-zinc-950 dark:text-zinc-100">{plan.name}</h3>
                    <p className="mt-3 min-h-[2.5rem] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {plan.description}
                    </p>
                    <div className="mt-5 flex items-end justify-center gap-1 text-zinc-950 dark:text-zinc-100">
                      <span className="text-3xl font-black tracking-tight">{plan.priceMain}</span>
                      <span className="pb-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                        {plan.priceSub}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-7 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.upcoming ? (
                    <button
                      type="button"
                      disabled
                      className="mt-7 w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-center text-sm font-bold text-zinc-500"
                    >
                      출시 예정
                    </button>
                  ) : (
                    <Link
                      href={
                        betaMode && plan.planKey === 'free'
                          ? '/auth'
                          : `/subscribe?plan=${encodeURIComponent(plan.planKey)}`
                      }
                      className={`mt-7 block w-full rounded-lg px-4 py-3 text-center text-sm font-bold transition ${
                        plan.popular
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
                      }`}
                    >
                      {plan.planKey === 'free'
                        ? betaMode
                          ? '무료로 시작하기'
                          : '무료체험 사용해보기'
                        : `${plan.name} 시작하기`}
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-10 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-4 bg-zinc-50 text-center text-sm font-bold text-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200">
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

            <p className="mt-6 text-center text-xs text-zinc-500">
              {betaMode
                ? '현재 표시된 유료 요금제는 정식 출시 후 적용될 예상 요금입니다. 자세한 내용은 가격 페이지에서 확인하세요.'
                : '표시된 금액과 제공량은 현재 서비스 기준입니다. 자세한 결제 조건은 가격 페이지에서 확인하세요.'}
            </p>
            <div className="mt-3 text-center">
              <Link
                href="/pricing"
                className="text-sm text-blue-700 underline underline-offset-2 hover:underline dark:text-blue-400"
              >
                가격 페이지 전체 보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
