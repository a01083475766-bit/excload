'use client';

import { landingContainerClass } from '@/app/components/landing/landingLayout';

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
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      : status === '오픈 베타'
        ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
        : 'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  return (
    <span className={`inline-flex rounded border px-2.5 py-1 text-xs font-bold ${tone}`}>
      {status}
    </span>
  );
}

export default function LandingTestWorkflowSection() {
  return (
    <section className="scroll-mt-24 border-b border-zinc-200 bg-zinc-50 py-8 dark:border-zinc-800 dark:bg-zinc-950/50 lg:py-11">
      <div className={landingContainerClass}>
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-blue-600 dark:text-blue-400">
            EXCLOAD WORKFLOW
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-3xl">
            주문연동부터 송장 전송까지, 한 흐름으로
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
            복잡한 주문관리 프로그램을 새로 배우지 않아도, 파일 정리와 연동으로 업무를 이어갈 수 있습니다.
          </p>
        </div>

        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">엑클로드 업무 흐름</h3>
          </div>
          <ol className="relative px-5 py-2">
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
                  <p className="mt-2 inline-flex rounded border border-dashed border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                    {item.sample}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
