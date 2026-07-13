'use client';

import { Maximize2, Package, RotateCcw, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';

import {
  EXCLOAD_PREVIEW_EMPTY_SHELL,
  EXCLOAD_PREVIEW_HEADER_ACTION_SPACER,
  EXCLOAD_PREVIEW_HEADER_ROW,
  EXCLOAD_PREVIEW_HEADER_TITLE_GROUP,
  EXCLOAD_PREVIEW_TOOL_BTN,
  EXCLOAD_PREVIEW_TOOLBAR_SHELL,
} from '@/app/lib/ui/excload-preview-ui';

type UserGuidePreviewToolbarProps = {
  /** 택배·물류 주문변환: 묶음배송 버튼 표시. 송장파일변환은 false */
  showBundleShipping?: boolean;
};

type UserGuidePreviewSectionProps = {
  showBundleShipping?: boolean;
  emptyLines: [string, string];
};

const prevent = (e: MouseEvent) => e.preventDefault();

export default function UserGuidePreviewToolbar({
  showBundleShipping = true,
}: UserGuidePreviewToolbarProps) {
  return (
    <div className={EXCLOAD_PREVIEW_TOOLBAR_SHELL}>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <button
          type="button"
          data-ex-tooltip="표 영역을 크게 펼쳐서 볼 때 씁니다."
          className={`ex-tooltip-target cursor-default ${EXCLOAD_PREVIEW_TOOL_BTN}`}
          onClick={prevent}
        >
          <Maximize2 className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          펼치기
        </button>
        <button
          type="button"
          data-ex-tooltip="첨부·주문 정보와 미리보기를 비우고 처음 화면 상태로 되돌립니다."
          className={`ex-tooltip-target cursor-default ${EXCLOAD_PREVIEW_TOOL_BTN}`}
          onClick={prevent}
        >
          <RotateCcw className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          초기화
        </button>
        <button
          type="button"
          data-ex-tooltip="체크한 행을 미리보기에서 삭제합니다."
          className="ex-tooltip-target inline-flex h-8 shrink-0 cursor-default items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 text-xs font-semibold text-white opacity-90"
          onClick={prevent}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          선택 삭제
        </button>
      </div>

      {showBundleShipping ? (
        <button
          type="button"
          data-ex-tooltip={`수령인·연락처·주소가 같은 주문을 묶어\u000a개별배송·묶음배송을 정할 수 있습니다.\u000a(가이드에서는 동작하지 않습니다.)`}
          className="ex-tooltip-target inline-flex h-8 shrink-0 cursor-default items-center justify-center gap-1.5 self-start rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-900 opacity-90 sm:self-auto"
          onClick={prevent}
        >
          <Package className="h-3.5 w-3.5" aria-hidden />
          묶음배송 2그룹
          <span className="font-medium text-violet-700/80">· 4건</span>
        </button>
      ) : null}
    </div>
  );
}

export function UserGuidePreviewHints() {
  return (
    <p
      data-ex-tooltip={`셀을 클릭하면 수정할 수 있습니다.\u000a헤더를 클릭하면 오름/내림차순으로 정렬됩니다.\u000a체크박스로 선택 후 삭제할 수 있습니다.`}
      className="ex-tooltip-target mb-2 cursor-default text-xs leading-relaxed text-zinc-500"
    >
      셀 클릭으로 수정 · 헤더 클릭으로 정렬 · 체크 후 선택 삭제
    </p>
  );
}

/** 본페이지(주문연동·택배·물류·송장) 미리보기와 동일 레이아웃 — 툴팁만 가이드용 */
export function UserGuidePreviewSection({
  showBundleShipping = true,
  emptyLines,
}: UserGuidePreviewSectionProps) {
  return (
    <section className="relative pb-2 pt-1">
      <div className={EXCLOAD_PREVIEW_HEADER_ROW}>
        <div className={EXCLOAD_PREVIEW_HEADER_TITLE_GROUP}>
          <h3
            data-ex-tooltip="변환된 주문이 표로 나타나는 영역입니다. 확인·수정 후 다운로드합니다."
            className="ex-tooltip-target cursor-default text-lg font-semibold text-gray-900"
          >
            미리보기
          </h3>
        </div>
        <div className={EXCLOAD_PREVIEW_HEADER_ACTION_SPACER} aria-hidden />
      </div>

      <UserGuidePreviewToolbar showBundleShipping={showBundleShipping} />
      <UserGuidePreviewHints />

      <div className={EXCLOAD_PREVIEW_EMPTY_SHELL}>
        <p className="max-w-md text-sm leading-relaxed text-gray-500">
          {emptyLines[0]}
          <br />
          {emptyLines[1]}
        </p>
      </div>
    </section>
  );
}

type UserGuideFormStatusBannerProps = {
  variant?: 'blue' | 'emerald';
  sampleHeaders: string;
  sampleFixed?: string;
};

/** 본페이지 하단 「사용 중인 양식 / 고정 입력 정보」 표시와 동일 */
export function UserGuideFormStatusBanner({
  variant = 'blue',
  sampleHeaders,
  sampleFixed = '보내는사람 홍길동 · 전화번호1 010-1234-5678',
}: UserGuideFormStatusBannerProps) {
  const textClass = variant === 'emerald' ? 'text-emerald-600' : 'text-blue-600';
  const textMutedClass = variant === 'emerald' ? 'text-emerald-500' : 'text-blue-500';
  const chipClass =
    variant === 'emerald'
      ? 'trial-soft-chip inline-block rounded-md px-2 py-0.5 text-xs font-medium'
      : 'inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600';

  return (
    <div className="mt-4 w-full space-y-1">
      <p
        data-ex-tooltip={`현재 적용 중인 업로드 양식의 열 이름입니다.\u000a양식을 바꾸면 이 목록도 함께 바뀝니다.`}
        className={`ex-tooltip-target cursor-default text-xs ${textClass} w-full overflow-hidden text-ellipsis whitespace-nowrap`}
      >
        <span className={chipClass}>사용 중인 양식 :</span> {sampleHeaders}
      </p>
      <p
        data-ex-tooltip={`모든 주문에 공통으로 넣는 고정 입력 값입니다.\u000a비어 있는 칸에만 채워지며, 주문에 값이 있으면 주문이 우선합니다.`}
        className={`ex-tooltip-target cursor-default text-xs ${textMutedClass} w-full overflow-hidden text-ellipsis whitespace-nowrap`}
      >
        <span className={chipClass}>고정 입력 정보 :</span> {sampleFixed}
      </p>
    </div>
  );
}
