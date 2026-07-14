'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';
import { getSignupBonusPoints, isOpenBetaMode } from '@/app/lib/open-beta-policy';
import Link from 'next/link';

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: '쇼핑몰 주문 가져오기',
    desc: '여러 쇼핑몰의 주문을 한곳에서 확인',
    sample: '쿠팡 · 스마트스토어 · 자사몰',
    status: '오픈 베타',
  },
  {
    step: '02',
    title: '주문 내용 정리',
    desc: '엑셀과 카톡 주문을 필요한 항목으로 정리',
    sample: '수령인 · 연락처 · 주소 · 상품',
    status: '사용 가능',
  },
  {
    step: '03',
    title: '택배·물류 양식 변환',
    desc: '택배사와 물류사 양식에 맞게 파일 변환',
    sample: 'CJ · 롯데 · 한진 · 로젠 양식',
    status: '사용 가능',
  },
  {
    step: '04',
    title: '송장번호 연결',
    desc: '출고 결과와 주문을 연결해 송장번호 매칭',
    sample: '출고 결과 ↔ 주문 행 매칭',
    status: '사용 가능',
  },
  {
    step: '05',
    title: '쇼핑몰 송장 전송',
    desc: '연결된 쇼핑몰에 배송정보 전송',
    sample: '택배사 + 송장번호 전달',
    status: '순차 지원',
  },
] as const;

function StatusPill({ status }: { status: string }) {
  const tone =
    status === '사용 가능'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : status === '오픈 베타'
        ? 'border-blue-300 bg-blue-50 text-blue-900'
        : 'border-zinc-300 bg-zinc-100 text-zinc-700';
  return (
    <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-bold ${tone}`}>
      {status}
    </span>
  );
}

/** 실서비스·/landing-test 공통 히어로 — 업무형 2단 */
export default function LandingHeroSection() {
  const betaMode = isOpenBetaMode();
  const signupBonusLabel = getSignupBonusPoints().toLocaleString();

  return (
    <section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className={`${landingContainerClass} py-8 sm:py-9 lg:py-10`}>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-stretch lg:gap-10">
          <div className="flex min-w-0 flex-col justify-center text-left">
            <p className="text-xs font-bold tracking-[0.18em] text-blue-600 dark:text-blue-400">
              EXCLOAD OPEN BETA
            </p>
            <p className="mt-2 text-base font-semibold text-zinc-600 dark:text-zinc-400">
              {betaMode ? '오픈 베타 참여자 모집 중' : '엑클로드 주요 기능 안내'}
            </p>

            <h1 className="mt-4 break-keep text-[2rem] font-bold leading-snug tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-[2.35rem] lg:text-[2.6rem]">
              복잡한 기능은 빼고 빠른 주문정리,
              <br />
              판매자의 반복 업무를 줄입니다.
            </h1>

            <p className="mt-4 max-w-xl break-keep text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
              쇼핑몰 주문연동, 카톡주문정리, 택배·물류파일 변환,
              <br className="hidden sm:block" />
              송장번호 매칭과 전송 기능을 오픈 베타에서 먼저 사용해보세요.
            </p>

            <ul className="mt-6 space-y-2.5 text-[15px] text-zinc-800 dark:text-zinc-200 sm:text-base">
              <li className="flex gap-2.5">
                <span className="font-bold text-blue-600">✓</span>
                오픈 베타 기간 무료 이용
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-blue-600">✓</span>
                가입 즉시 {signupBonusLabel}P 제공
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-blue-600">✓</span>
                매월 {signupBonusLabel}P 추가 제공
              </li>
              <li className="flex gap-2.5">
                <span className="font-bold text-blue-600">✓</span>
                자동 유료 전환 없음
              </li>
            </ul>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/auth"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-blue-600 px-6 text-base font-semibold text-white hover:bg-blue-700"
              >
                오픈 베타 참여하기
              </Link>
              <a
                href="#features"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-6 text-base font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                기능 둘러보기
              </a>
            </div>
          </div>

          <div className="flex min-w-0 flex-col border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">엑클로드 업무 흐름</h2>
              <span className="text-xs font-medium text-zinc-500">예시 화면 · 실제 수치 아님</span>
            </div>
            <ol className="relative flex-1 px-5 py-2">
              {WORKFLOW_STEPS.map((item, index) => (
                <li key={item.step} className="relative flex gap-4 py-4">
                  {index < WORKFLOW_STEPS.length - 1 ? (
                    <span
                      className="absolute left-[15px] top-11 bottom-0 w-px bg-blue-200 dark:bg-blue-900"
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-xs font-bold text-blue-700 dark:bg-zinc-950">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="mt-1 break-keep text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {item.desc}
                    </p>
                    <p className="mt-2 inline-flex rounded border border-dashed border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                      {item.sample}
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
