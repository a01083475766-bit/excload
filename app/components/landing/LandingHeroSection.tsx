'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import Image from 'next/image';
import Link from 'next/link';

const HERO_FEATURES = [
  '오픈 베타 무료',
  '부분 주문연동',
  '택배·물류·송장 변환',
  '카톡·엑셀 주문 정리',
] as const;

function LandingHeroBackgroundImage() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-zinc-50 dark:bg-black" aria-hidden>
      <div className="absolute inset-0">
        <Image
          src="/landing/hero-bg-laptop.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover object-center opacity-[0.28] blur-[4px]"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-white/85 via-white/78 to-zinc-50 dark:from-black/80 dark:via-black/75 dark:to-black" />
    </div>
  );
}

/** 실서비스·/landing-test 공통 히어로 — 베타·부분 주문연동·무료테스트 유도 */
export default function LandingHeroSection() {
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();

  return (
    <section className="blue-unified-theme relative overflow-hidden">
      <LandingHeroBackgroundImage />
      <div className={`${landingContainerClass} relative z-10 py-14 sm:py-16 lg:py-20`}>
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            EXCLOAD
          </p>
          <p className="mt-4 inline-flex border border-blue-200 bg-white/90 px-3 py-1 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-zinc-900/80 dark:text-blue-300">
            {betaMode ? '오픈 베타 · 무료로 이용' : '무료 체험으로 먼저 확인'}
          </p>

          <h1 className="mt-6 break-keep text-[clamp(1.85rem,4.2vw,3.1rem)] font-bold leading-[1.2] tracking-tight text-zinc-950 dark:text-zinc-50">
            주문 확인부터 송장 전송까지,
            <br className="hidden sm:block" />
            {betaMode ? '오픈 베타에서 먼저 써보세요.' : '반복 업무를 한곳에서 정리하세요.'}
          </h1>

          <p className="mt-6 max-w-2xl break-keep text-base font-medium leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
            {betaMode ? (
              <>
                엑셀·카톡 주문 변환에 더해, 쇼핑몰{' '}
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">부분 주문연동</span>을
                추가했습니다. 가입 시 {signupBonusLabel}P · 매월 {signupBonusLabel} 포인트 사용량,
                엑셀 다운로드는 무제한으로 이용할 수 있습니다.
              </>
            ) : (
              <>
                쇼핑몰·카톡 주문을 택배사 양식에 맞게 정리하고, 쇼핑몰 주문연동으로 반복 작업을
                줄입니다.
              </>
            )}
          </p>

          <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <a
              href="#free-trial"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-7 text-base font-semibold text-white transition hover:bg-blue-700"
            >
              무료 테스트하기
            </a>
            <Link
              href={betaMode ? '/auth/signup' : '/order/integration'}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 bg-white/90 px-7 text-base font-semibold text-zinc-900 transition hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500"
            >
              {betaMode ? '무료로 시작하기' : '주문연동 살펴보기'}
            </Link>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {betaMode
              ? '오픈 베타 이용자는 자동으로 유료 전환되지 않습니다.'
              : '가입 없이 아래에서 바로 테스트할 수 있습니다.'}
          </p>

          <ul className="mt-10 flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-3 border-y border-zinc-200/90 py-5 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            {HERO_FEATURES.map((feature) => (
              <li className="flex items-center gap-2.5" key={feature}>
                <span className="h-px w-4 bg-blue-600 dark:bg-blue-400" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
