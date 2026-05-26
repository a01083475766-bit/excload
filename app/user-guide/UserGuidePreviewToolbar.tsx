"use client";

const PREVIEW_TOOLBAR_BTN =
  "ex-tooltip-target inline-flex h-9 flex-shrink-0 cursor-default items-center justify-center rounded-lg border px-3 text-sm font-medium leading-none";

type UserGuidePreviewToolbarProps = {
  /** 택배·물류 주문변환: 묶음배송 버튼 표시. 송장파일변환은 false */
  showBundleShipping?: boolean;
};

export default function UserGuidePreviewToolbar({
  showBundleShipping = true,
}: UserGuidePreviewToolbarProps) {
  const prevent = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="row-start-1 col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <button
        type="button"
        data-ex-tooltip="표 영역을 크게 펼쳐서 볼 때 씁니다."
        className={`${PREVIEW_TOOLBAR_BTN} border-gray-300 bg-white text-gray-800`}
        onClick={prevent}
      >
        펼치기
      </button>
      <button
        type="button"
        data-ex-tooltip="첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다."
        className={`${PREVIEW_TOOLBAR_BTN} border-amber-500/80 bg-amber-50 text-amber-900`}
        onClick={prevent}
      >
        미리보기 초기화
      </button>
      <button
        type="button"
        data-ex-tooltip="체크한 행을 미리보기에서 삭제합니다."
        className={`${PREVIEW_TOOLBAR_BTN} border-red-600 bg-red-600 text-white`}
        onClick={prevent}
      >
        선택 삭제
      </button>
      {showBundleShipping ? (
        <button
          type="button"
          data-ex-tooltip={`수령인·연락처·주소가 같은 주문을 묶어\u000a개별배송·묶음배송을 정할 수 있습니다.\u000a(가이드에서는 동작하지 않습니다.)`}
          className={`${PREVIEW_TOOLBAR_BTN} border-violet-500/80 bg-violet-50 text-violet-900`}
          onClick={prevent}
        >
          묶음배송가능건확인 (4그룹 · 8건)
        </button>
      ) : null}
    </div>
  );
}

export function UserGuidePreviewHints() {
  return (
    <p className="row-start-2 col-start-2 min-w-0 text-sm text-gray-500">
      ✔ 셀을 클릭하면 수정할 수 있습니다. ✔ 주소, 상품 등을 클릭하면 오름/내림차순 정렬됩니다. ✔
      체크박스로 선택 후 삭제할 수 있습니다.
    </p>
  );
}
