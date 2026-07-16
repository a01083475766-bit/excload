'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import LandingHeroVisual from '@/app/components/landing/LandingHeroVisual';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import Link from 'next/link';

/** 랜딩 히어로 — 좌 카피 / 우 실무형 작업 화면 데모 */
export default function LandingHeroSection() {
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();

  return (
    <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className={`${landingContainerClass} pt-11 pb-7 sm:pt-14 sm:pb-8 lg:pt-20 lg:pb-11`}>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-12">
          <div className="flex min-w-0 flex-col justify-center text-left">
            <p className="text-xs font-bold tracking-[0.2em] text-blue-600 dark:text-blue-400">
              EXCLOAD OPEN BETA
            </p>
            <p className="mt-2 text-base font-semibold text-zinc-600 dark:text-zinc-400">
              {betaMode ? '오픈 베타 참여자 모집 중' : '엑클로드 주요 기능 안내'}
            </p>

            <h1 className="mt-4 break-keep text-[1.85rem] font-bold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[2.2rem] lg:text-[2.5rem]">
              복잡한 기능은 빼고
              <br />
              <span className="text-blue-600 dark:text-blue-400">빠른 주문정리,</span>
              <br />
              판매자의 반복 업무를 줄입니다.
            </h1>

            <p className="mt-4 max-w-xl break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
              엑셀·카톡 주문 파일 정리부터 쇼핑몰 주문연동, 택배·물류·송장 파일 변환까지.
              {betaMode ? ' 오픈 베타 참여자는 주요 기능을 먼저 무료로 이용할 수 있습니다.' : null}
            </p>

            {betaMode ? (
              <ul className="mt-6 space-y-2.5 text-[15px] text-zinc-800 dark:text-zinc-200 sm:text-base">
                <li className="flex gap-2.5">
                  <span className="font-bold text-blue-600">✓</span>
                  가입 즉시 {signupBonusLabel}P · 매월 {signupBonusLabel}P 제공
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-blue-600">✓</span>
                  주문연동·파일 변환 오픈 베타 우선 이용
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bold text-blue-600">✓</span>
                  엑셀 다운로드 무제한 · 자동 유료 전환 없음
                </li>
              </ul>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/auth"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-600 px-6 text-base font-semibold text-white hover:bg-blue-700"
              >
                {betaMode ? '오픈 베타 참여하기' : '시작하기'}
              </Link>
              <a
                href="#free-trial"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-base font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                바로 체험하기
              </a>
              <a
                href="#features"
                className="inline-flex min-h-12 items-center justify-center text-base font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                기능 둘러보기 →
              </a>
            </div>
          </div>

          <div className="w-full lg:w-auto lg:shrink-0">
            <LandingHeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
