'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import Link from 'next/link';

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: '쇼핑몰 주문 가져오기',
    desc: '여러 쇼핑몰의 주문을 한곳에서 확인',
    status: '오픈 베타',
  },
  {
    step: '02',
    title: '주문 내용 정리',
    desc: '엑셀과 카톡 주문을 필요한 항목으로 정리',
    status: '사용 가능',
  },
  {
    step: '03',
    title: '택배·물류 양식 변환',
    desc: '택배사와 물류사 양식에 맞게 파일 변환',
    status: '사용 가능',
  },
  {
    step: '04',
    title: '송장번호 연결',
    desc: '출고 결과와 주문을 연결해 송장번호 매칭',
    status: '사용 가능',
  },
  {
    step: '05',
    title: '쇼핑몰 송장 전송',
    desc: '연결된 쇼핑몰에 배송정보 전송',
    status: '순차 지원',
  },
] as const;

function StatusPill({ status }: { status: string }) {
  const tone =
    status === '사용 가능'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === '오픈 베타'
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-zinc-200 bg-zinc-50 text-zinc-600';
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

/** 실서비스·/landing-test 공통 히어로 — 업무형 2단, 장식 이미지 없음 */
export default function LandingHeroSection() {
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();
  const signupHref = '/auth/signup';

  return (
    <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className={`${landingContainerClass} py-10 sm:py-12 lg:py-14`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12">
          <div className="min-w-0 text-left">
            <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600 dark:text-blue-400">
              EXCLOAD OPEN BETA
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              {betaMode ? '오픈 베타 참여자 모집 중' : '엑클로드 주요 기능 안내'}
            </p>

            <h1 className="mt-5 break-keep text-[1.75rem] font-bold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[2.1rem] lg:text-[2.35rem]">
              주문 정리부터 송장 처리까지,
              <br />
              판매자의 반복 업무를 줄입니다.
            </h1>

            <p className="mt-4 max-w-xl break-keep text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-base">
              쇼핑몰 주문연동, 카톡 주문 변환, 택배·물류 파일 변환,
              <br className="hidden sm:block" />
              송장번호 변환과 전송 기능을 오픈 베타에서 먼저 사용해 보세요.
            </p>

            <ul className="mt-6 space-y-2 text-sm text-zinc-800 dark:text-zinc-200">
              <li className="flex gap-2">
                <span className="font-semibold text-blue-600">✓</span>
                오픈 베타 기간 무료 이용
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-blue-600">✓</span>
                가입 즉시 {signupBonusLabel}P 제공
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-blue-600">✓</span>
                매월 {signupBonusLabel}P 추가 제공
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-blue-600">✓</span>
                자동 유료 전환 없음
              </li>
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={signupHref}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                오픈 베타 참여하기
              </Link>
              <a
                href="#features"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                기능 둘러보기
              </a>
            </div>

            <p className="mt-4 max-w-md break-keep text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              카드 등록 없이 시작할 수 있으며,
              <br />
              별도의 동의 없이 유료로 전환되지 않습니다.
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">엑클로드 업무 흐름</h2>
              <span className="text-[11px] font-medium text-zinc-500">실제 업무 순서</span>
            </div>
            <ol className="mt-3 space-y-0">
              {WORKFLOW_STEPS.map((item, index) => (
                <li
                  key={item.step}
                  className={`flex gap-3 py-3 ${
                    index < WORKFLOW_STEPS.length - 1 ? 'border-b border-zinc-200 dark:border-zinc-800' : ''
                  }`}
                >
                  <span className="w-7 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-blue-600">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="mt-1 break-keep text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
