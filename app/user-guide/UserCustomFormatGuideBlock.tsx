'use client';

import { ArrowRightLeft } from 'lucide-react';

type UserCustomFormatGuideBlockProps = {
  variant: 'courier' | 'logistics';
};

const STEPS = [
  {
    title: '1. 원본 주문파일 헤더',
    description: '주문파일에 들어 있는 원래 열 이름을 확인합니다. 수정할 수 없습니다.',
  },
  {
    title: '2. 다운로드 파일에 표시될 이름',
    description:
      '최종 엑셀에서 쓸 열 이름을 바꿉니다. 이름만 바뀌고, 그 아래 주문 값은 그대로 연결됩니다.',
  },
  {
    title: '3. 최종 출력 순서',
    description:
      '다운로드에 넣을 항목을 원하는 순서로 올립니다. 올린 항목만 저장되며, 열 데이터도 함께 이동합니다.',
  },
] as const;

export function UserCustomFormatGuideBlock({ variant }: UserCustomFormatGuideBlockProps) {
  const uploadLabel =
    variant === 'courier' ? '택배 업로드 양식 등록' : '물류센터 업로드 양식 등록';
  const accentClass =
    variant === 'courier'
      ? 'border-blue-200 bg-blue-50/80 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100'
      : 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100';
  const stepBadgeClass =
    variant === 'courier' ? 'bg-blue-600' : 'bg-emerald-600';

  return (
    <section className="relative pb-4 pt-2" aria-labelledby={`user-guide-custom-format-${variant}`}>
      <div className={`rounded-xl border px-4 py-5 sm:px-6 ${accentClass}`}>
        <div className="mb-4 flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/70 dark:bg-zinc-900/40">
            <ArrowRightLeft className="h-5 w-5 opacity-80" aria-hidden />
          </div>
          <h3
            id={`user-guide-custom-format-${variant}`}
            className="text-base font-semibold"
          >
            사용자 지정양식 만들기
          </h3>
        </div>

        <p className="mx-auto mb-4 max-w-3xl text-center text-sm leading-relaxed">
          업로드용 엑셀 양식 파일이 없거나, 주문파일 열 이름·순서를 직접 정하고 싶을 때 사용합니다.
          헤더명이나 출력 순서를 바꿔도 해당 열의 주문 데이터는 함께 이동합니다.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-lg border border-white/60 bg-white/60 px-3 py-2.5 text-left dark:border-zinc-700/60 dark:bg-zinc-900/30"
            >
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <ul className="mx-auto max-w-3xl space-y-1.5 text-sm leading-relaxed">
          <li>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${stepBadgeClass}`} aria-hidden />
            아래 「{uploadLabel}」 버튼을 누른 뒤, 나오는 화면에서 「사용자 지정양식 만들기」를 누르면
            시작할 수 있습니다.
          </li>
          <li>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${stepBadgeClass}`} aria-hidden />
            주문파일을 올린 뒤 열 이름이 맞지 않다는 안내가 보이면, 그 안내에서 「사용자 지정양식
            만들기」를 눌러 바로 시작할 수 있습니다.
          </li>
          <li>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${stepBadgeClass}`} aria-hidden />
            설정을 저장한 뒤, 같은 형식의 주문파일을 다시 올리면 저장해 둔 열 이름·순서대로 변환됩니다.
          </li>
        </ul>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            data-ex-tooltip={`주문파일을 먼저 선택하면 원본 헤더가 표시됩니다.\u000a열 이름을 바꾸고, 출력할 항목을 3번 줄에 올려 저장합니다.\u000a(가이드에서는 실제 저장·변환이 되지 않습니다.)`}
            className="ex-tooltip-target cursor-default rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 opacity-90 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            onClick={(e) => e.preventDefault()}
          >
            사용자 지정양식 만들기 (안내)
          </button>
        </div>
      </div>
    </section>
  );
}
