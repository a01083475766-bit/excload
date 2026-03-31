'use client';

import DemoAnimation from '@/app/components/DemoAnimation';
import Link from 'next/link';
import { Check } from 'lucide-react';

export default function HomePage() {
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
        <section className="pt-4 pb-12 lg:pt-6 lg:pb-16">
          <div className="flex flex-col items-center text-center gap-4">
            {/* 첫 번째 줄 - 가장 넓게 */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-zinc-950 dark:text-zinc-100 leading-tight max-w-4xl">
              반복되는 주문 정리, 엑클로드에서 한 번에 끝내세요.
            </h1>

            {/* 두 번째 줄 - 중간 넓이 */}
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
              카톡·상세페이지·엑셀 주문을 택배 업로드 양식으로 자동 변환합니다.
            </p>
            
            {/* 세 번째 줄 - 가장 좁게 */}
            <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-500 max-w-lg leading-relaxed">
              커피 한 잔을, 당신의 시간에 양보하세요.
            </p>
            
              
            {/* 데모 애니메이션 */}
            <div className="w-full mt-12">
              <DemoAnimation />
            </div>
          </div>
        </section>

        {/* 설명 텍스트 섹션 */}
        <section className="py-12 lg:py-16">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              주문 정리 때문에 스트레스 받으셨나요?
            </h2>
            <div className="space-y-3 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                카톡 주문을 엑셀로 옮기고, 엑셀을 다시 택배 양식에 맞게 수정하는 번거로운 작업, 이제 그만하세요.
              </p>
              <p>
                여러 경로로 들어온 주문을 자동 분석해 택배 업로드 파일로 한 번에 정리합니다.
              </p>
              <p className="text-zinc-700 dark:text-zinc-300">
                어렵지 않습니다. 몇 번의 클릭이면 충분합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 가격 섹션 */}
        <section className="py-16 lg:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">가격 플랜</h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">가격 페이지의 핵심 정보를 바로 확인하고 시작하세요.</p>
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
                    {plan.name} 시작하기
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-6 text-center text-xs text-zinc-500">자세한 비교는 가격 페이지에서 확인하세요.</p>
            <div className="mt-3 text-center">
              <Link href="/pricing" className="text-sm text-blue-600 hover:underline underline-offset-2">
                가격 페이지 전체 보기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
