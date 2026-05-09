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

export default function UserGuidePage() {
  return (
    <div className="pt-1.5 pb-8 bg-zinc-50 dark:bg-black">
      <main className="max-w-[1200px] mx-auto px-3 sm:px-5 lg:px-8">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          이 페이지는 <strong>안내만</strong> 제공합니다. 실제 변환·파일 업로드는{' '}
          <strong>택배주문변환</strong> 메뉴에서 이용해 주세요. 버튼에 마우스를 올리면 짧은 설명이
          나타납니다.
        </div>

        {/* Hero + 입력 — order-convert와 동일한 껍데기 */}
        <section className="relative pt-1 pb-3">
          <div className="flex flex-col gap-2 lg:gap-3">
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2">
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-start">
                <button
                  type="button"
                  data-ex-tooltip="쇼핑몰과 연결된 경우, 여기서 주문 목록을 불러올 수 있어요. (가이드에서는 동작하지 않습니다.)"
                  className="ex-tooltip-target flex h-[38px] w-full cursor-default items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white opacity-90 sm:w-[200px]"
                  onClick={(e) => e.preventDefault()}
                >
                  주문 가져오기
                </button>
              </div>
              <p className="order-first min-w-0 flex-1 self-center px-1 text-center text-sm leading-snug text-gray-500 sm:order-none">
                엑셀 파일, 텍스트, 이미지로 전달된 주문 정보를 불러와 택배 업로드 파일로 자동 변환합니다.
              </p>
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-end">
                <div
                  data-ex-tooltip="회원일 때 표시됩니다. 이용 가능한 건수가 여기서 줄어듭니다."
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
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      주문엑셀·이미지 파일을 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div
                    data-ex-tooltip="엑셀·이미지를 올리면 변환을 시작합니다. 가이드에서는 데모입니다."
                    className="ex-tooltip-target flex h-[180px] w-full cursor-default flex-col items-center justify-center gap-2.5 overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4"
                  >
                    <Upload className="h-8 w-8 text-gray-400" aria-hidden />
                    <div className="space-y-0.5 text-center">
                      <p className="text-sm font-medium text-gray-700">엑셀파일 · 이미지파일</p>
                      <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                      <p className="mt-1.5 text-xs text-gray-400">(xlsx, xls, jpg, png, gif)</p>
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
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    <textarea
                      readOnly
                      data-ex-tooltip="붙여 넣은 글을 주문 표로 정리할 때 사용하는 칸입니다."
                      className="ex-tooltip-target min-h-[180px] w-full flex-1 basis-0 cursor-default resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600"
                      placeholder="예) 홍길동 010-1234-5766   무선마우스 2개&#10;서울시 강남구 테헤란로 123  문앞에 놓아주세요"
                    />
                    <button
                      type="button"
                      data-ex-tooltip="입력한 텍스트를 위쪽에 설정한 택배 양식에 맞춰 표로 바꿉니다. 먼저 양식을 등록하는 것이 좋아요."
                      className="ex-tooltip-target flex w-full cursor-default items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-90"
                      onClick={(e) => e.preventDefault()}
                    >
                      텍스트 주문 변환
                    </button>
                  </div>
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
                <div className="row-start-1 col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    data-ex-tooltip="표 영역을 크게 펼쳐서 볼 때 씁니다."
                    className="ex-tooltip-target inline-flex h-9 w-20 shrink-0 cursor-default items-center justify-center rounded border text-sm"
                    onClick={(e) => e.preventDefault()}
                  >
                    펼치기
                  </button>
                  <button
                    type="button"
                    data-ex-tooltip="표·입력만 지우고, 등록한 양식은 그대로 둡니다."
                    className="ex-tooltip-target inline-flex h-9 shrink-0 cursor-default items-center justify-center rounded border border-amber-500/80 bg-amber-50 px-3 text-sm font-medium text-amber-900"
                    onClick={(e) => e.preventDefault()}
                  >
                    미리보기 초기화
                  </button>
                </div>
                <p className="row-start-2 col-start-2 min-w-0 text-sm text-gray-500">
                  ✔ 셀을 클릭하면 수정할 수 있습니다. ✔ 주소, 상품 등을 클릭하면 정렬됩니다. ✔ 체크 후 삭제할 수
                  있습니다.
                </p>
              </div>
            </div>
            <div className="flex min-h-[192px] items-center justify-center px-4 text-center text-sm leading-relaxed text-gray-400">
              <p>
                주문을 가져오면 변환결과가 여기에 표시됩니다
                <br />
                파일 크기·주문 건수·PC/인터넷 환경에 따라 처리 시간이 다소 걸릴 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        {/* 하단 3카드 */}
        <section className="relative pb-4 pt-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
            <button
              type="button"
              data-ex-tooltip="택배사에 올리는 엑셀 형식을 한 번 등록해 두면, 그 열 구조에 맞춰 결과가 나갑니다."
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
              data-ex-tooltip="모든 주문에 같은 보내는 사람 정보가 있을 때만, 미리 넣어 두는 칸입니다. (선택)"
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
              data-ex-tooltip="미리보기가 맞으면, 택배사에 올릴 엑셀 파일로 저장합니다."
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
      </main>
    </div>
  );
}
