/**
 * 주문연동 허브와 동일한 미리보기 툴바·컨테이너 클래스 (UI 정렬용).
 */

export const EXCLOAD_PREVIEW_TOOL_BTN =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40';

export const EXCLOAD_PREVIEW_TOOLBAR_SHELL =
  'mb-2.5 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between';

/**
 * 미리보기 제목 행 — 주문연동 「송장 매칭·전송」(h-9) 자리까지 포함해
 * 택배·물류·송장과 세로 여백을 동일하게 맞춤.
 */
export const EXCLOAD_PREVIEW_HEADER_ROW =
  'mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';

export const EXCLOAD_PREVIEW_HEADER_TITLE_GROUP =
  'flex min-w-0 flex-wrap items-center gap-2.5';

/** 우측 액션 없을 때 주문연동 버튼과 동일 높이만 확보 (데스크톱) */
export const EXCLOAD_PREVIEW_HEADER_ACTION_SPACER =
  'hidden h-9 shrink-0 sm:block';

export const EXCLOAD_PREVIEW_TABLE_SHELL =
  'rounded-xl border border-gray-200 bg-white';

export const EXCLOAD_PREVIEW_EMPTY_SHELL =
  'flex h-[260px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-10 text-center';

export const EXCLOAD_PREVIEW_HEIGHT_DEFAULT = 'h-[260px]';
export const EXCLOAD_PREVIEW_HEIGHT_EXPANDED = 'max-h-[750px] h-auto';

/** 안내·오류·확인 모달 — 코드매핑/허브와 동일 톤 (과한 그라데이션·둥근 장식 지양) */
export const EXCLOAD_MODAL_OVERLAY =
  'fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4';

export const EXCLOAD_MODAL_PANEL =
  'w-full rounded-xl border border-zinc-200 bg-white shadow-xl';

export const EXCLOAD_MODAL_TITLE = 'text-lg font-semibold text-zinc-900';

export const EXCLOAD_MODAL_BODY = 'text-sm leading-relaxed text-zinc-600';

export const EXCLOAD_MODAL_BTN_PRIMARY =
  'rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

export const EXCLOAD_MODAL_BTN_SECONDARY =
  'rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';

export const EXCLOAD_MODAL_BTN_PRIMARY_EMERALD =
  'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
