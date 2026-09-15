'use client';

/**
 * 매크로양식 화면과 동일한 껍데기 + 툴팁 (데모만, 기능 없음)
 */

import { ArrowDown, Coins, Search, Truck, Upload } from 'lucide-react';
import { Fragment } from 'react';

import {
  UserGuideFormStatusBanner,
  UserGuidePreviewSection,
} from './UserGuidePreviewToolbar';

const MACRO_WORKFLOW_STEPS = [
  {
    label: '사용자 지정양식 등록',
    tip: '출력에 쓸 열 이름·순서를 직접 만듭니다.\u000a아래 ‘사용자 지정양식 등록’ → ‘사용자 지정양식 만들기’에서\u000a샘플 주문 파일(헤더가 있는 엑셀)을 올린 뒤 연결합니다.',
  },
  {
    label: '주문 파일 또는 주문 정보(텍스트·이미지) 입력',
    tip: '등록한 지정양식과 같은 헤더 구조의 주문 파일을 올립니다.\u000a헤더가 다르면 값이 비어 보일 수 있습니다.\u000a텍스트·이미지도 같은 방식으로 변환할 수 있습니다.',
  },
  {
    label: '변환 완료 · 미리보기 확인',
    tip: '미리보기에서 열과 값을 확인합니다.\u000a필요하면 셀을 수정하거나 정렬·삭제합니다.',
  },
  {
    label: '(선택) 고정 입력 정보 설정',
    tip: '모든 행에 공통으로 넣을 값이 있으면 고정 입력을 사용합니다.\u000a예: 관리용 번호, 보내는분 등.',
  },
  {
    label: '변환 파일 다운로드',
    tip: '미리보기 내용 그대로 사용자 지정양식 엑셀을 내려받습니다.\u000a거래처 제출·자체 관리용으로 사용하면 됩니다.',
  },
] as const;

export function MacroFormatUserGuideSection() {
  return (
    <div className="mt-12 border-t border-zinc-200 pt-10 dark:border-zinc-800">
      <h2 className="mb-2 text-center text-xl font-bold text-zinc-900 dark:text-zinc-100">매크로양식</h2>
      <p className="mb-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
        원하는 열과 순서를 직접 지정해 나만의 양식으로 주문자료를 변환합니다.
      </p>
      <div className="mx-auto mb-6 max-w-3xl rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        택배·물류 자동 변환이 잘 안 되거나, 일반 업로드 양식이 아닌{' '}
        <strong>본인만 쓰는 엑셀 구조</strong>일 때 사용합니다. 지정양식은 이 페이지에서만 저장·사용됩니다.
        실제 작업은 상단 메뉴 「매크로양식」에서 진행해 주세요.
      </div>

      <section className="relative pt-1 pb-3">
        <div className="flex flex-col gap-2 lg:gap-3">
          <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-start">
              <button
                type="button"
                data-ex-tooltip={`자주 쓰는 쇼핑몰 URL을 등록해 두면\u000a여기서 새 창으로 바로 열 수 있어요.\u000a(가이드에서는 동작하지 않습니다.)`}
                className="ex-tooltip-target flex h-[38px] w-full cursor-default items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white opacity-90 sm:w-[200px]"
                onClick={(e) => e.preventDefault()}
              >
                즐겨찾는 쇼핑몰
              </button>
            </div>
            <p className="order-first min-w-0 flex-1 self-center px-1 text-center text-sm leading-snug text-gray-500 sm:order-none">
              엑셀·텍스트·이미지 주문을 사용자 지정양식에 맞춰 변환합니다.
            </p>
            <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-end">
              <div
                data-ex-tooltip={`회원일 때 표시됩니다.\u000a이용 가능한 사용량이 여기서 줄어듭니다.`}
                className="ex-tooltip-target flex h-[38px] w-full min-w-0 cursor-default items-center justify-end gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-sky-600 px-3 text-white opacity-90 shadow-md sm:w-[200px]"
              >
                <Coins className="h-4 w-4 shrink-0" aria-hidden />
                <span className="shrink-0 text-sm font-medium">잔여 사용량</span>
                <span className="min-w-0 truncate text-sm font-bold tabular-nums">: —</span>
              </div>
            </div>
          </div>

          <div className="w-full rounded-xl border-2 border-blue-500 bg-white p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
              <div className="flex w-full flex-col lg:w-1/2">
                <div
                  data-ex-tooltip={`등록한 지정양식과 같은 헤더 구조의 주문 엑셀·이미지를 올립니다.\u000a「이 파일 헤더 전용」양식은 등록 때 쓴 파일과 헤더가 같아야 값이 잘 채워집니다.\u000a(가이드에서는 실제 업로드·변환이 되지 않습니다.)`}
                  className="ex-tooltip-target cursor-default rounded-lg outline-offset-2"
                >
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      주문엑셀·이미지 파일을 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div className="flex h-[180px] w-full cursor-default flex-col items-center justify-center gap-2.5 overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                    <Upload className="h-8 w-8 text-gray-400" aria-hidden />
                    <div className="space-y-0.5 text-center">
                      <p className="text-sm font-medium text-gray-700">엑셀파일 · 이미지파일</p>
                      <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                      <p className="mt-1.5 text-xs text-gray-400">(xlsx, xls, jpg, png, gif)</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  data-ex-tooltip="화면 캡처(이미지)에서 글자를 읽어 주문으로 넣을 때 사용합니다."
                  className="ex-tooltip-target mt-2.5 w-full cursor-default rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-90"
                  onClick={(e) => e.preventDefault()}
                >
                  캡처화면 주문변환 (스크린샷 주문 변환)
                </button>
              </div>

              <div className="flex w-full flex-col lg:w-1/2">
                <div
                  data-ex-tooltip={`카카오톡·문자 등 주문 글을 붙여 넣습니다.\u000a등록해 둔 사용자 지정양식에 맞춰 표로 바꿉니다.`}
                  className="ex-tooltip-target flex min-h-0 flex-1 flex-col cursor-default rounded-lg outline-offset-2"
                >
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카톡·문자 등 주문 내용을 붙여 넣어 주세요
                    </p>
                  </div>
                  <div className="flex min-h-[180px] flex-1 cursor-default items-start rounded-lg border border-gray-300 bg-gray-50 p-3 text-xs text-gray-400">
                    로그인 후 주문 내용을 붙여 넣을 수 있습니다.
                  </div>
                </div>
                <button
                  type="button"
                  data-ex-tooltip={`입력한 텍스트를 등록해 둔 사용자 지정양식에 맞춰 표로 바꿉니다.\u000a먼저 지정양식을 등록해 주세요.`}
                  className="ex-tooltip-target mt-2.5 flex w-full cursor-default items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-90"
                  onClick={(e) => e.preventDefault()}
                >
                  텍스트 주문 변환
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <UserGuidePreviewSection />

      <section className="relative pb-4 pt-4">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
          <button
            type="button"
            data-ex-tooltip={`(필수) 출력 열 이름·순서를 직접 만듭니다.\u000a‘사용자 지정양식 만들기’에서 샘플 파일을 올리고\u000a원본 헤더 → 출력 이름·순서를 연결한 뒤 저장합니다.\u000a목록의 「등록 시 원본 헤더」로 어떤 파일 구조인지 확인할 수 있습니다.`}
            className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            onClick={(e) => e.preventDefault()}
          >
            <div className="mb-2 flex items-center justify-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                <Truck className="h-5 w-5 text-gray-500" aria-hidden />
              </div>
              <h3 className="text-center text-sm font-semibold text-gray-900">사용자 지정양식 등록</h3>
            </div>
            <p className="mt-1 text-center text-xs text-gray-500">
              주문 파일 헤더를 직접 연결해 원하는 열 순서로
              <br />
              나만의 다운로드 엑셀 양식을 만듭니다.
            </p>
          </button>

          <button
            type="button"
            data-ex-tooltip={`모든 주문에 같은 값이 필요할 때 사용합니다.\u000a보내는분·관리번호 등 공통값을 미리 넣을 수 있습니다 (선택)`}
            className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            onClick={(e) => e.preventDefault()}
          >
            <div className="mb-2 flex items-center justify-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                <Search className="h-5 w-5 text-gray-500" aria-hidden />
              </div>
              <h3 className="text-center text-sm font-semibold text-gray-900">고정 입력 정보 설정</h3>
            </div>
            <p className="mt-1 text-center text-xs text-gray-500">
              보내는 사람 정보 등 모든 주문에 공통으로 적용되는 값을
              <br />
              미리 등록하여 매번 입력하는 번거로움을 줄일 수 있습니다.
            </p>
          </button>

          <button
            type="button"
            data-ex-tooltip={`미리보기가 맞으면 사용자 지정양식 엑셀을 내려받습니다.\u000a거래처 제출·자체 관리용 파일로 사용하면 됩니다.`}
            className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            onClick={(e) => e.preventDefault()}
          >
            <div className="mb-2 flex items-center justify-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                <ArrowDown className="h-5 w-5 text-gray-500" aria-hidden />
              </div>
              <h3 className="text-center text-sm font-semibold text-gray-900">변환 파일 다운로드</h3>
            </div>
            <p className="mt-1 text-center text-xs text-gray-500">
              변환이 완료된 주문데이터를 미리보기 기준으로
              <br />
              사용자 지정양식 파일로 내려받는 단계입니다.
            </p>
          </button>
        </div>

        <UserGuideFormStatusBanner
          sampleHeaders="사용자 지정 · 넘버 · 보내는분 · 연락처 · 주소"
          sampleFixed="넘버 1111 · 보내는분 홍길동"
        />
      </section>

      <section className="relative pb-2 pt-2" aria-labelledby="macro-guide-workflow-heading">
        <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 py-5 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/40 sm:px-6">
          <h3
            id="macro-guide-workflow-heading"
            className="mb-4 text-center text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            매크로양식 · 권장 순서
          </h3>
          <ol className="mx-auto max-w-3xl space-y-0">
            {MACRO_WORKFLOW_STEPS.map((step, index) => (
              <Fragment key={step.label}>
                {index > 0 ? (
                  <li className="flex justify-center py-0.5 text-zinc-400" aria-hidden>
                    <span className="text-lg leading-none">↓</span>
                  </li>
                ) : null}
                <li>
                  <div
                    data-ex-tooltip={step.tip}
                    className="ex-tooltip-target flex cursor-default gap-3 rounded-lg py-2.5 pl-1 pr-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 self-center text-sm font-medium leading-snug text-zinc-800 dark:text-zinc-200">
                      {step.label}
                    </span>
                  </div>
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
