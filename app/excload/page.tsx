'use client';

import {
  LandingHowToSteps,
  LandingPrePricingCta,
  LandingWhyHowCarriers,
} from '@/app/components/landing/LandingReferenceSections';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

const typingHeroTextClass =
  'font-bold leading-tight text-zinc-950 dark:text-zinc-100 text-[clamp(1.2rem,4vw,1.8rem)] tracking-tight [word-break:keep-all]';

export default function HomePage() {
  /** 서비스 한 줄은 박스 위에 고정, 박스 안에서는 아래 두 줄만 타이핑 */
  const heroTypingLines = useMemo(
    () =>
      [
        '복잡한 기능을 빼고 "빠른주문정리"에만 집중해 사용법이 어렵지 않습니다',
        '이제 복사해서 붙이면 준비 끝',
      ] as const,
    [],
  );
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [heroTypingDone, setHeroTypingDone] = useState(false);

  useEffect(() => {
    if (heroTypingDone) return;

    const currentLine = heroTypingLines[lineIdx];
    const isTypingChar = charIdx < currentLine.length;
    const delay = isTypingChar ? 38 : lineIdx + 1 < heroTypingLines.length ? 420 : 0;

    const timer = window.setTimeout(() => {
      if (isTypingChar) {
        setCharIdx((prev) => prev + 1);
        return;
      }
      if (lineIdx + 1 < heroTypingLines.length) {
        setLineIdx((prev) => prev + 1);
        setCharIdx(0);
        return;
      }
      setHeroTypingDone(true);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [heroTypingDone, lineIdx, charIdx, heroTypingLines]);

  const plans = [
    {
      planKey: 'free' as const,
      name: '무료',
      priceLabel: '무료',
      description: '무료 이용 플랜',
      features: ['매월 5,000 사용량 제공', '텍스트 입력 최대 5,000자', '엑셀 다운로드 1회 1,000 사용량 차감'],
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
    <div className="pt-6 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-7xl mx-auto px-6">
        {/* Hero 섹션 */}
        <section className="blue-unified-theme pt-8 pb-8 lg:pt-12 lg:pb-12">
          <div className="flex flex-col gap-0">
            <p className="mb-6 mx-auto max-w-5xl text-center text-base sm:text-lg font-medium leading-snug text-zinc-900 dark:text-zinc-100 [word-break:keep-all] md:mb-8">
              엑클로드는 택배 업로드 파일을 간편하게 만들어주는 서비스입니다.
            </p>
            <div className="mx-auto mb-4 w-full max-w-5xl rounded-2xl border border-blue-200 bg-white/90 p-5 text-left shadow-sm dark:border-blue-900 dark:bg-zinc-900/90 md:p-6 lg:p-7">
              <div
                className={`flex min-h-[min(170px,22vh)] flex-col justify-center md:min-h-[200px] ${typingHeroTextClass} space-y-2 md:space-y-2.5`}
              >
                {heroTypingDone ? (
                  heroTypingLines.map((line, lIndex) => <p key={`done-${lIndex}`}>{line}</p>)
                ) : (
                  heroTypingLines.map((line, lIndex) => {
                    const isPast = lIndex < lineIdx;
                    const isCurrent = lIndex === lineIdx;
                    const isFuture = lIndex > lineIdx;

                    if (isFuture) return null;

                    if (isPast) {
                      return <p key={`line-${lIndex}`}>{line}</p>;
                    }

                    if (isCurrent) {
                      return (
                        <p key={`line-${lIndex}`}>
                          {line.slice(0, charIdx)}
                          {charIdx < line.length ? <span className="animate-pulse text-zinc-400">|</span> : null}
                        </p>
                      );
                    }

                    return null;
                  })
                )}
              </div>
            </div>

            {/* 기존 데모 애니메이션 자리 — 3단계 안내 (참고 랜딩) */}
            <div className="w-full py-8 lg:py-12">
              <div className="mx-auto w-full max-w-6xl">
                <div className="rounded-2xl border border-blue-200 bg-white/90 p-5 shadow-sm dark:border-blue-900 dark:bg-zinc-900/90 md:p-7 lg:p-8">
                  <LandingHowToSteps variant="embedded" />
                </div>
              </div>
            </div>

            {/* 데모 하단: 가격 강조 (한 줄) */}
            <div className="flex flex-col items-center text-center max-w-3xl mx-auto px-3 pt-0.5">
              <p className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                비싼 프로그램은 부담스럽고 주문 정리가 힘들다면, 부담을 줄여 보세요 —{' '}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">월 4,000원</span> 엑클로드.
              </p>
            </div>

            {/* 홈에서도 바로 체험 가능: 기존 /trial 페이지는 그대로 유지 */}
            <div className="w-full mt-4">
              <TrialEmbed trialMode />
              <p className="mt-2 text-center text-sm sm:text-base text-zinc-500 dark:text-zinc-500 leading-snug">
                전체 화면이 필요하면{' '}
                <Link href="/trial" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300">
                  체험 전용 페이지
                </Link>
                로 이동할 수 있습니다.
              </p>
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
            <div className="flex justify-center overflow-x-auto">
              <div className="grid w-max max-w-full min-w-0 grid-cols-[max-content_auto_minmax(8rem,1fr)] gap-x-2 gap-y-2 text-left text-sm sm:gap-x-3 sm:text-base leading-snug text-zinc-600 dark:text-zinc-400">
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
