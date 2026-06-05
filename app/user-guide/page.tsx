'use client';

/**
 * 택배 주문변환 화면 구조를 보여주는 사용 가이드 (데모 UI, 기능 없음)
 */

import {
  ArrowDown,
  Coins,
  Search,
  Truck,
  Upload,
} from 'lucide-react';
import { Fragment } from 'react';

import { InvoiceFileUserGuideSection } from './InvoiceFileUserGuideSection';
import { LogisticsUserGuideSection } from './LogisticsUserGuideSection';
import UserGuidePreviewToolbar, { UserGuidePreviewHints } from './UserGuidePreviewToolbar';

const USER_GUIDE_WORKFLOW_STEPS = [
  {
    label: '택배사 업로드 양식 등록',
    tip: '택배사에 업로드할 때 쓰는 엑셀 양식을 먼저 등록합니다.\u000a아래 ‘택배 업로드 양식 등록’에서 진행합니다.',
  },
  {
    label: '주문 파일 또는 주문 정보(텍스트·이미지) 입력',
    tip: '주문 엑셀·이미지를 올리거나, 텍스트·카톡·문자 내용을 붙여 넣어 주문을 반영합니다.\u000a실제 서비스에서는 주문 입력이 필요합니다.',
  },
  {
    label: '변환 완료',
    tip: '업로드·변환 처리가 끝나면 미리보기 표에 결과가 채워집니다.\u000a파일 크기·주문량·환경에 따라 시간이 조금 걸릴 수 있습니다.',
  },
  {
    label: '미리보기 확인 및 수정',
    tip: '미리보기에서 주소·상품 등을 확인하고, 필요하면 셀을 수정하거나 정렬·삭제합니다.',
  },
  {
    label: '택배 업로드 파일 다운로드',
    tip: '내용이 맞으면 택배사 업로드용 엑셀 파일을 내려받습니다.\u000a다운로드된 엑셀 파일을 택배프로그램에 업로드하시면 됩니다.',
  },
] as const;

export default function UserGuidePage() {
  return (
    <div className="pt-1.5 pb-8 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-3 sm:px-5 lg:px-8">
        <h1 className="mb-3 text-center text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          엑클로드(EXCLOAD) 사용가이드
        </h1>
        <p className="mb-4 text-center text-sm leading-relaxed text-gray-600 px-2">
          택배주문변환, 물류주문변환, 송장파일변환 기능을 단계별로 안내합니다.
          주문 엑셀 변환·택배 엑셀 변환·물류 주문 변환 흐름을 미리 살펴볼 수 있습니다.
        </p>
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          각 위치에 마우스를 올리시면 기능 설명을 드리는 사용가이드입니다. 익숙하지 않은 용어 안내도 포함했습니다
          (실제 변환 및 기능은 적용되지 않습니다).
        </div>

        <h2 className="mb-4 text-center text-xl font-bold text-zinc-900 dark:text-zinc-100">택배 주문변환</h2>

        {/* Hero + 입력 — order-convert와 동일한 껍데기 */}
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
                엑셀 파일, 텍스트, 이미지로 전달된 주문 정보를 불러와 택배 업로드 파일로 자동 변환합니다.
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
                    data-ex-tooltip={`주문 엑셀·이미지를 선택하거나 아래 점선 영역에 끌어다 놓으면 변환이 진행됩니다.\u000a(가이드에서는 실제 업로드·변환이 되지 않습니다.)\u000a실제 서비스에서는 주문 데이터를 반영한 뒤 변환이 가능합니다.`}
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

                <div className="flex min-h-0 w-full flex-col border-l-0 border-gray-200 pl-0 lg:w-1/2 lg:border-l lg:pl-5">
                  {/* textarea는 CSS ::after 미지원 → 래퍼에 툴팁 */}
                  <div
                    data-ex-tooltip={`카카오톡·문자·주문페이지 등에서 받은 주문 글을 이 칸에 붙여 넣습니다.\u000a아래 '텍스트 주문 변환'으로 등록한 택배 업로드 양식에 맞춰 표로 바꿉니다.`}
                    className="ex-tooltip-target flex min-h-0 flex-1 flex-col cursor-default rounded-lg outline-offset-2"
                  >
                    <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="shrink-0 text-base font-semibold text-gray-900">텍스트 주문입력</h3>
                      <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                        카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                      </p>
                    </div>
                    <textarea
                      readOnly
                      className="min-h-[180px] w-full flex-1 basis-0 cursor-default resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600"
                      placeholder="예) 홍길동 010-1234-5766   무선마우스 2개&#10;서울시 강남구 테헤란로 123  문앞에 놓아주세요"
                    />
                  </div>
                  <button
                    type="button"
                    data-ex-tooltip={`입력한 텍스트를 등록해 둔 택배 업로드 양식에 맞춰 표로 바꿉니다.\u000a미리 양식을 등록해 주세요.`}
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

        {/* 미리보기 영역 */}
        <section className="relative py-3">
          <div className="w-full rounded-xl border border-gray-300 bg-gray-200">
            <div className="px-6 pb-4 pt-6">
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
                <h3 className="row-start-1 col-start-1 self-center text-lg font-semibold">미리보기</h3>
                <UserGuidePreviewToolbar />
                <UserGuidePreviewHints />
              </div>
            </div>
            <div className="flex min-h-[192px] items-center justify-center px-4 text-center text-sm leading-relaxed text-gray-400">
              <p>
                주문을 가져오면 변환결과가 여기에 표시됩니다
                <br />
                파일 크기·주문 사용량·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 하단 3카드 */}
        <section className="relative pb-4 pt-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
            <button
              type="button"
              data-ex-tooltip={`(필수) 택배사에 올리는 엑셀 양식을 한 번 등록합니다.\u000a한 번 등록해 두면, 그 양식에 맞게 주문 정리가 됩니다.`}
              className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
              onClick={(e) => e.preventDefault()}
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">택배 업로드 양식 등록</h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                실제 택배사 업로드에 사용하는 엑셀 양식을 등록해주세요.
                <br />
                등록하신 양식 그대로 자동 설정됩니다.
              </p>
            </button>

            <button
              type="button"
              data-ex-tooltip={`모든 주문에 같은 고정입력이 필요할 때 사용합니다.\u000a보내는 사람 정보, 택배사 등의 고정입력을 설정할 수 있습니다 (선택)`}
              className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
              onClick={(e) => e.preventDefault()}
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Search className="h-5 w-5 text-gray-500" />
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
              data-ex-tooltip={`내용이 맞으면 택배사 업로드용 엑셀 파일을 내려받습니다.\u000a다운로드된 엑셀 파일을 택배프로그램에 업로드하시면 됩니다.`}
              className="ex-tooltip-target flex h-[120px] cursor-default flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
              onClick={(e) => e.preventDefault()}
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">택배 업로드 파일 다운로드</h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                변환이 완료된 주문 데이터를
                <br />
                택배사 업로드용 파일로 내려받는 단계입니다.
              </p>
            </button>
          </div>
        </section>

        {/* 권장 작업 순서 (랜딩·가이드용) */}
        <section className="relative pb-2 pt-2" aria-labelledby="user-guide-workflow-heading">
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-white px-4 py-5 shadow-sm dark:border-zinc-600 dark:bg-zinc-900/40 sm:px-6">
            <h3
              id="user-guide-workflow-heading"
              className="mb-4 text-center text-base font-semibold text-zinc-900 dark:text-zinc-100"
            >
              택배 주문변환 · 권장 순서
            </h3>
            <ol className="mx-auto max-w-3xl space-y-0">
              {USER_GUIDE_WORKFLOW_STEPS.map((step, index) => (
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

        <LogisticsUserGuideSection />

        <InvoiceFileUserGuideSection />
      </main>
    </div>
  );
}
