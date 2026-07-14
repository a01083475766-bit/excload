/**
 * 가격·결제·구독 안내. 서비스 설명 중심 페이지는 app/about/page.tsx 와 역할을 분리합니다.
 * ⚠️ EXCLOAD CONSTITUTION — 결제/Stripe 연동은 본 페이지·API 경로에서만 다룹니다.
 */
'use client';

import { Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { PricingPlanCta } from '@/app/pricing/PricingPlanCta';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';

export default function PricingPage() {
  const { status } = useSession();
  const betaMode = isOpenBetaMode();
  const signupBonus = getSignupBonusPoints();

  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      price: '0',
      period: '월',
      description: '무료 이용 플랜',
      features: [
        '매월 5,000 사용량 제공',
        '텍스트 변환 시 글자수만큼 사용량 차감',
        '엑셀 다운로드 1회 최대 1,000 사용량 차감(잔여가 더 적으면 전액 차감)',
        '텍스트 입력 최대 5,000자',
      ],
      recommendations: [
        '주문을 간편하게 정리하고 싶은 분',
        '월별·일별 주문량이 일정하지 않은 판매자',
        '월 주문량이 많지 않은 개인 판매자',
      ],
      popular: false,
      showVat: false,
    },
    {
      planKey: 'monthly' as const,
      name: '프로',
      price: '4,000',
      period: '월',
      description: '꾸준한 주문 처리를 위한 플랜',
      features: [
        '매월 400,000 사용량 제공',
        '텍스트 변환 시 글자수만큼 사용량 차감',
        '엑셀 다운로드 무제한',
      ],
      recommendations: [
        '매일 들어오는 주문을 빠르게 정리해야 하는 분',
        '엑셀 주문 변환에 많은 시간이 소요되는 분',
        '카카오톡, 메시지, 텍스트 주문이 많은 분',
        '판매 채널이 많아 주문 정리에 시간이 많이 걸리는 분',
        '오입력이나 반송 문제를 줄이고 싶은 분',
        '반복되는 주문 정리 작업을 자동화하여 시간을 절약하고 싶은 분',
      ],
      popular: true,
      showVat: true,
    },
    {
      planKey: 'yearly' as const,
      name: '연간',
      price: '40,000',
      period: '년',
      description: '장기 이용자를 위한 연간 플랜',
      features: [
        '20% 할인',
        '매월 400,000 사용량 제공',
        '텍스트 변환 시 글자수만큼 사용량 차감',
        '엑셀 다운로드 무제한',
      ],
      recommendations: [
        '매일 들어오는 주문을 빠르게 정리해야 하는 분',
        '엑셀 주문 변환에 많은 시간이 소요되는 분',
        '카카오톡, 메시지, 텍스트 주문이 많은 분',
        '판매 채널이 많아 주문 정리에 시간이 많이 걸리는 분',
        '오입력이나 반송 문제를 줄이고 싶은 분',
        '반복되는 주문 정리 작업을 자동화하여 시간을 절약하고 싶은 분',
        '연간 할인으로 비용을 절약하며 안정적으로 사용하고 싶은 분',
        '매달 꾸준히 주문을 처리하는 온라인 판매자 또는 사업자',
      ],
      popular: false,
      showVat: true,
    },
  ];

  const comparisonRows = [
    { label: '무료체험', free: '가능', monthly: '가능', yearly: '가능' },
    { label: '월 사용량', free: '5,000', monthly: '400,000', yearly: '400,000' },
    { label: '엑셀 다운로드', free: '차감 방식', monthly: '무제한', yearly: '무제한' },
    { label: '추천 대상', free: '처음 테스트', monthly: '꾸준한 운영', yearly: '장기 이용' },
  ];

  const betaStartHref =
    status === 'authenticated' ? '/order/integration' : '/auth/signup';

  return (
    <div className="min-h-screen bg-zinc-50 pt-12 dark:bg-black">
      <main className="mx-auto max-w-[1200px] px-3 py-8 sm:px-5 lg:px-8">
        <div className="mb-12 rounded-xl border border-blue-100 bg-white px-5 py-12 text-center shadow-sm dark:border-blue-950 dark:bg-zinc-900 sm:px-8 lg:mb-16 lg:px-12">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            PRICE PLAN
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-4xl lg:text-5xl">
            {betaMode
              ? '오픈 베타 기간에는 무료로 이용할 수 있습니다'
              : '무료로 먼저 써보고, 필요할 때만 업그레이드'}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-lg">
            {betaMode ? (
              <>
                회원가입 시 {signupBonus.toLocaleString()}P를 제공하고, 베타 기간에는 매월 잔액을
                리셋한 뒤 {signupBonus.toLocaleString()}P가 지급됩니다.
                <br />
                엑셀 다운로드에는 포인트가 차감되지 않으며, AI 텍스트 변환을 사용할 때만 글자 수만큼
                포인트가 차감됩니다. 오픈 베타 이용자는 자동으로 유료 전환되지 않습니다.
              </>
            ) : (
              <>
                엑클로드(EXCLOAD)는 주문 엑셀 변환, 송장 파일 변환, 물류 주문 변환을 하나의 서비스에서
                이용할 수 있습니다.
              </>
            )}
          </p>
          {betaMode ? (
            <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-500">
              현재 표시된 유료 요금제는 정식 출시 후 적용될 예상 요금입니다.
            </p>
          ) : (
            <p className="mx-auto mt-3 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              추천: 무료체험으로 결과를 먼저 확인해보세요.
            </p>
          )}
        </div>

        {betaMode ? (
          <section className="mb-10 w-full rounded-xl border-2 border-blue-600 bg-white p-6 shadow-sm dark:bg-zinc-900 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold tracking-wide text-blue-600">OPEN BETA</p>
                <h2 className="mt-2 text-2xl font-black text-zinc-950 dark:text-zinc-100 sm:text-3xl">
                  엑클로드 오픈 베타
                </h2>
                <p className="mt-2 text-lg font-semibold text-zinc-800 dark:text-zinc-200">무료</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  회원가입만 하면 엑클로드의 주요 기능을 무료로 사용할 수 있습니다.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    회원가입 시 {signupBonus.toLocaleString()}P 제공
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    베타 기간 매월 잔액 리셋 후 {signupBonus.toLocaleString()}P 지급
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    엑셀 다운로드 무료
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    텍스트 변환 시에만 포인트 차감
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    자동 유료 전환 없음
                  </li>
                </ul>
              </div>
              <Link
                href={betaStartHref}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-8 text-base font-semibold text-white transition hover:bg-blue-700"
              >
                무료로 시작하기
              </Link>
            </div>
          </section>
        ) : null}

        {betaMode ? (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              정식 출시 예정 요금제
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              아래 요금제는 정식 출시 후 적용될 예정입니다. 가격과 제공 혜택은 베타 운영 결과에 따라
              변경될 수 있습니다.
            </p>
          </div>
        ) : null}

        <div className="mb-12 grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
          {plans.map((plan) => (
            <div
              key={plan.planKey}
              className={`relative flex flex-col rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900 md:min-h-[520px] lg:p-8 ${
                plan.popular
                  ? 'border-blue-600 dark:border-blue-500'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-sm font-bold text-white">
                  {betaMode ? '정식 출시 추천' : '인기 플랜'}
                </div>
              )}
              {betaMode ? (
                <div className="mb-3 inline-flex self-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  정식 출시 예정
                </div>
              ) : null}

              <div className="mb-7 text-center">
                <h3 className="text-2xl font-black text-zinc-950 dark:text-zinc-100">
                  {plan.name}
                </h3>
                <p className="mx-auto mt-3 min-h-[2.5rem] text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {plan.description}
                </p>
                <div className="mt-5 flex flex-col items-center gap-1">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-black tracking-tight text-zinc-950 dark:text-zinc-100">
                      {plan.price === '0' ? '무료' : `₩${plan.price}`}
                    </span>
                    {plan.price !== '0' && (
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                        / {plan.period}
                      </span>
                    )}
                  </div>
                  {plan.showVat && (
                    <span className="text-xs text-zinc-500">(VAT 별도)</span>
                  )}
                </div>
              </div>

              <ul className="mb-8 space-y-2.5">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mb-8 flex-1 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <h4 className="mb-3.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  이런 분께 추천합니다
                </h4>
                <ul className="space-y-2">
                  {plan.recommendations.map((recommendation, recIndex) => (
                    <li key={recIndex} className="flex items-start gap-2">
                      <span className="mt-0.5 text-xs text-zinc-500">•</span>
                      <span className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {recommendation}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <PricingPlanCta planKey={plan.planKey} planName={plan.name} />
            </div>
          ))}
        </div>

        <div className="mb-12 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-4 bg-zinc-50 text-center text-sm font-bold text-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200">
              <div className="px-3 py-3 text-left">비교 항목</div>
              <div className="px-3 py-3">무료</div>
              <div className="px-3 py-3">프로</div>
              <div className="px-3 py-3">연간</div>
            </div>
            {comparisonRows.map((row) => (
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

        <p className="mx-auto mb-10 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          {betaMode
            ? '오픈 베타 기간에는 신규 유료 결제를 받지 않습니다. 정식 출시 후 요금제가 적용됩니다.'
            : '선택한 플랜 주기에 따라 정기결제가 진행됩니다. 결제 전 이용 조건을 확인해 주세요.'}
        </p>

        <div className="mt-12 text-center lg:mt-16">
          <div className="rounded-xl bg-blue-600 p-8 lg:p-12">
            <h2 className="mb-4 text-3xl font-bold text-white">더 많은 정보가 필요하신가요?</h2>
            <p className="mb-8 text-lg text-blue-100">고객 지원팀이 도와드리겠습니다.</p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 font-semibold text-blue-600 transition-colors hover:bg-blue-50"
            >
              문의하기
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
