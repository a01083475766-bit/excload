'use client';

import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';

type Accent = 'blue' | 'emerald';

type DirectMappingEditorModalProps = {
  open: boolean;
  accent?: Accent;
  sourceHeaders: string[];
  sourceSamples: Record<string, string[]>;
  renameValues: string[];
  outputOrder: number[];
  customHeaderInputOpen: boolean;
  newHeaderInput: string;
  draggingSourceIndex: number | null;
  dragOverOrderIndex: number | null;
  onClose: () => void;
  onRenameChange: (sourceIndex: number, value: string) => void;
  onAddSourceToOutput: (sourceIndex: number) => void;
  onRemoveOutputHeader: (sourceIndex: number) => void;
  onMoveOutputHeader: (sourceIndex: number, direction: -1 | 1) => void;
  onCustomHeaderInputOpen: (open: boolean) => void;
  onNewHeaderInputChange: (value: string) => void;
  onAddCustomHeader: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, sourceIndex: number) => void;
  onDragOver: (event: React.DragEvent<HTMLTableCellElement>, orderIndex: number) => void;
  onDrop: (event: React.DragEvent<HTMLTableCellElement>, orderIndex: number) => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onCreateFormat: () => void;
  getOutputHeaderName: (outputIndex: number) => string;
};

const accentMap = {
  blue: {
    chip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
    added: 'border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100',
    grab: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100',
    drop: 'border-blue-300 bg-blue-50/70 dark:bg-blue-950/30',
    drag: 'border-blue-400 bg-blue-100 text-blue-900 opacity-70 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-100',
    addBtn: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    customBtn: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  },
  emerald: {
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    added: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100',
    grab: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100',
    drop: 'border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30',
    drag: 'border-emerald-400 bg-emerald-100 text-emerald-900 opacity-70 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-100',
    addBtn: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    customBtn: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
} as const;

const stickyLabelClass =
  'sticky left-0 z-10 min-w-[132px] max-w-[160px] border-r border-zinc-200 bg-white px-2.5 py-2.5 text-left text-xs sm:min-w-[200px] sm:max-w-[240px] sm:px-3 sm:py-3 sm:text-sm lg:min-w-[300px] lg:max-w-[338px] lg:px-4 dark:border-zinc-700 dark:bg-zinc-900';

const stickyLabelHeaderClass =
  'sticky left-0 z-20 min-w-[132px] max-w-[160px] border-b border-r border-zinc-200 bg-zinc-100 px-2.5 py-2.5 text-left text-xs sm:min-w-[200px] sm:max-w-[240px] sm:px-3 sm:py-3 sm:text-sm lg:min-w-[300px] lg:max-w-[338px] lg:px-4 dark:border-zinc-700 dark:bg-zinc-800';

const dataCellClass =
  'w-[148px] min-w-[148px] max-w-[148px] overflow-hidden border-b border-r border-zinc-200 px-2 py-2 align-top text-sm sm:w-[168px] sm:min-w-[168px] sm:max-w-[168px] sm:px-3 lg:w-[200px] lg:min-w-[200px] lg:max-w-[200px] dark:border-zinc-700';

const headerNameClassName =
  'truncate text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-100';

const samplePreviewLineClassName =
  'mt-1 block h-4 w-full min-w-0 max-w-full shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4 text-zinc-500 dark:text-zinc-400';

const MAX_SAMPLE_DISPLAY_LENGTH = 32;

function formatDirectMappingSampleText(samples: string[]): string {
  if (samples.length === 0) return '-';
  const joined = samples.join(' / ');
  if (joined.length <= MAX_SAMPLE_DISPLAY_LENGTH) return joined;
  return `${joined.slice(0, MAX_SAMPLE_DISPLAY_LENGTH - 1)}…`;
}

function DirectMappingSamplePreview({
  samples,
  className = '',
}: {
  samples: string[];
  className?: string;
}) {
  const fullText = samples.length === 0 ? '-' : samples.join(' / ');
  const text = formatDirectMappingSampleText(samples);
  return (
    <div className={`${samplePreviewLineClassName} ${className}`.trim()} title={`예시값: ${fullText}`}>
      예시값: {text}
    </div>
  );
}

export function DirectMappingEditorModal({
  open,
  accent = 'blue',
  sourceHeaders,
  sourceSamples,
  renameValues,
  outputOrder,
  customHeaderInputOpen,
  newHeaderInput,
  draggingSourceIndex,
  dragOverOrderIndex,
  onClose,
  onRenameChange,
  onAddSourceToOutput,
  onRemoveOutputHeader,
  onMoveOutputHeader,
  onCustomHeaderInputOpen,
  onNewHeaderInputChange,
  onAddCustomHeader,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragEnd,
  onCreateFormat,
  getOutputHeaderName,
}: DirectMappingEditorModalProps) {
  const colors = accentMap[accent];

  const customHeaderSection = (
    <div className="mt-3">
      {customHeaderInputOpen ? (
        <div className="space-y-2">
          <input
            type="text"
            value={newHeaderInput}
            onChange={(event) => onNewHeaderInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAddCustomHeader();
              if (event.key === 'Escape') {
                onCustomHeaderInputOpen(false);
                onNewHeaderInputChange('');
              }
            }}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            placeholder="예: 운임구분"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAddCustomHeader}
              className={`min-w-[84px] flex-1 rounded px-4 py-2 text-xs font-semibold text-white ${colors.primaryBtn}`}
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => {
                onCustomHeaderInputOpen(false);
                onNewHeaderInputChange('');
              }}
              className="min-w-[84px] flex-1 rounded border border-zinc-300 px-4 py-2 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCustomHeaderInputOpen(true)}
          className={`w-full rounded border px-4 py-2 text-xs font-semibold ${colors.customBtn}`}
        >
          새 헤더 추가 +
        </button>
      )}
    </div>
  );

  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      aria-labelledby="direct-header-mapping-title"
      panelClassName="w-full max-w-[1482px]"
      overlayClassName="p-1.5 sm:p-4"
    >
      <div className="flex h-[94dvh] w-full max-w-[1482px] flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:h-[88vh] sm:p-4 lg:h-[84vh] lg:p-6">
        <div className="mb-3 flex-shrink-0 sm:mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                id="direct-header-mapping-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 sm:text-xl"
              >
                사용자 지정양식 만들기
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                주문파일의 열을 원하는 이름과 순서로 바꿔 저장합니다. 헤더명·순서를 바꾸면 그 열의
                주문 데이터도 함께 이동됩니다.
                <span className="mt-1 block lg:inline lg:before:content-['\00a0']">
                  저장 후 같은 형식의 주문파일을 다시 업로드하면, 설정한 양식대로 변환됩니다.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="닫기"
            >
              <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">1번</span> 원본
              주문파일 헤더명
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">2번</span> 다운로드
              파일에 표시될 이름
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">3번</span> 최종 출력
              순서
            </div>
          </div>
        </div>

        {/* 모바일·태블릿: 카드형 편집 */}
        <div className="min-h-0 flex-1 space-y-4 overflow-auto lg:hidden">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              열 이름 편집
            </h3>
            {sourceHeaders.map((sourceHeader, index) => {
              const isAddedToOutput = outputOrder.includes(index);
              return (
                <article
                  key={`mobile-source-${sourceHeader}-${index}`}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-800/40"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    원본 헤더
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {sourceHeader}
                  </p>
                  <DirectMappingSamplePreview
                    samples={sourceSamples[sourceHeader] ?? []}
                    className="mt-1.5"
                  />
                  <label className="mt-3 block">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      다운로드 파일 이름
                    </span>
                    <input
                      type="text"
                      value={renameValues[index] ?? ''}
                      onChange={(event) => onRenameChange(index, event.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </label>
                  {isAddedToOutput ? (
                    <p className={`mt-3 rounded-lg border px-3 py-2 text-center text-xs font-semibold ${colors.added}`}>
                      출력 순서에 추가됨
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddSourceToOutput(index)}
                      className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-sm font-semibold ${colors.addBtn}`}
                    >
                      출력 순서에 추가
                    </button>
                  )}
                </article>
              );
            })}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">출력 순서</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              아래 순서대로 다운로드 파일 열이 만들어집니다. 버튼으로 순서를 바꿀 수 있습니다.
            </p>
            <div className="mt-3 space-y-2">
              {outputOrder.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  위에서 항목을 추가해 주세요.
                </p>
              ) : (
                outputOrder.map((sourceIndex, orderIndex) => {
                  const outputHeader = getOutputHeaderName(sourceIndex);
                  return (
                    <div
                      key={`mobile-order-${sourceIndex}-${orderIndex}`}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-800/50"
                    >
                      <span
                        className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${colors.primaryBtn}`}
                      >
                        {orderIndex + 1}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {outputHeader}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onMoveOutputHeader(sourceIndex, -1)}
                          disabled={orderIndex === 0}
                          className="rounded border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                          aria-label="위로"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveOutputHeader(sourceIndex, 1)}
                          disabled={orderIndex === outputOrder.length - 1}
                          className="rounded border border-zinc-300 px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-zinc-600"
                          aria-label="아래로"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveOutputHeader(sourceIndex)}
                          className="rounded border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 dark:border-rose-900 dark:text-rose-300"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {customHeaderSection}
          </section>
        </div>

        {/* 데스크톱: 기존 표 편집 */}
        <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 lg:block dark:border-zinc-700">
          <p className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            열이 많으면 표를 좌우로 스크롤할 수 있습니다. 2번 줄 항목은 아래 3번 줄로 드래그하거나
            모바일 화면의 「출력 순서에 추가」 버튼을 사용하세요.
          </p>
          <table className="w-full table-fixed border-collapse text-sm">
            <tbody>
              <tr className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <th className={stickyLabelHeaderClass}>
                  <div className="font-semibold">1. 원본 주문파일 헤더</div>
                  <div className="mt-1 hidden text-xs font-normal leading-relaxed text-zinc-500 dark:text-zinc-400 lg:block">
                    현재 주문파일에 들어있는 원래 열 이름입니다.
                  </div>
                </th>
                {sourceHeaders.map((sourceHeader, index) => (
                  <td key={`direct-source-${sourceHeader}-${index}`} className={dataCellClass}>
                    <div className={headerNameClassName}>{sourceHeader}</div>
                    <DirectMappingSamplePreview samples={sourceSamples[sourceHeader] ?? []} />
                  </td>
                ))}
              </tr>
              <tr>
                <th className={`${stickyLabelClass} border-b text-zinc-600 dark:text-zinc-300`}>
                  <div className="font-semibold">2. 다운로드 파일에 표시될 이름</div>
                  <div className="mt-1 hidden text-xs font-normal leading-relaxed text-zinc-500 dark:text-zinc-400 lg:block">
                    다운로드될 파일에 표시할 열 이름입니다. 필요하면 수정하세요.
                  </div>
                </th>
                {sourceHeaders.map((sourceHeader, index) => {
                  const isAddedToOutput = outputOrder.includes(index);
                  return (
                    <td
                      key={`direct-rename-${sourceHeader}-${index}`}
                      className="w-[148px] min-w-[148px] max-w-[148px] overflow-hidden border-b border-r border-zinc-100 px-2 py-2 align-top sm:w-[168px] sm:min-w-[168px] sm:max-w-[168px] sm:px-3 lg:w-[200px] lg:min-w-[200px] lg:max-w-[200px] dark:border-zinc-800"
                    >
                      <input
                        type="text"
                        value={renameValues[index] ?? ''}
                        onChange={(event) => onRenameChange(index, event.target.value)}
                        className="h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <div
                        draggable={!isAddedToOutput}
                        onDragStart={(event) => {
                          if (!isAddedToOutput) onDragStart(event, index);
                        }}
                        onDragEnd={onDragEnd}
                        className={`mt-2 min-h-[40px] rounded-lg border px-3 py-2 text-sm font-semibold leading-5 ${
                          isAddedToOutput
                            ? `cursor-default ${colors.added}`
                            : `cursor-grab active:cursor-grabbing ${colors.grab}`
                        }`}
                      >
                        <div className="truncate">
                          {isAddedToOutput ? '추가됨' : renameValues[index]?.trim() || sourceHeader}
                        </div>
                      </div>
                      {!isAddedToOutput && (
                        <button
                          type="button"
                          onClick={() => onAddSourceToOutput(index)}
                          className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-xs font-semibold lg:hidden ${colors.addBtn}`}
                        >
                          출력 순서에 추가
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th className={`${stickyLabelClass} text-zinc-600 dark:text-zinc-300`}>
                  <div className="font-semibold">3. 최종 출력 순서</div>
                  <div className="mt-1 hidden text-xs font-normal leading-relaxed text-zinc-500 dark:text-zinc-400 lg:block">
                    원하는 순서로 드래그해서 옮기세요.
                  </div>
                  {customHeaderSection}
                </th>
                {Array.from({
                  length: Math.max(sourceHeaders.length, outputOrder.length + 1),
                }).map((_, orderIndex) => {
                  const sourceIndex = outputOrder[orderIndex];
                  const hasOutput = typeof sourceIndex === 'number';
                  const outputHeader = hasOutput ? getOutputHeaderName(sourceIndex) : '';
                  return (
                    <td
                      key={`direct-final-slot-${orderIndex}`}
                      onDragOver={(event) => onDragOver(event, orderIndex)}
                      onDrop={(event) => onDrop(event, orderIndex)}
                      onDragLeave={onDragLeave}
                      className={`w-[148px] min-w-[148px] max-w-[148px] overflow-hidden border-r px-2 py-2 align-top transition-colors sm:w-[168px] sm:min-w-[168px] sm:max-w-[168px] sm:px-3 lg:w-[200px] lg:min-w-[200px] lg:max-w-[200px] dark:border-zinc-800 ${
                        dragOverOrderIndex === orderIndex ? colors.drop : 'border-zinc-100'
                      }`}
                    >
                      {!hasOutput ? (
                        <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
                          여기에 놓기
                        </div>
                      ) : (
                        <div
                          draggable
                          onDragStart={(event) => onDragStart(event, sourceIndex)}
                          onDragEnd={onDragEnd}
                          className={`min-h-14 cursor-grab rounded-lg border px-3 py-2 text-sm font-semibold leading-5 active:cursor-grabbing ${
                            draggingSourceIndex === sourceIndex ? colors.drag : colors.grab
                          }`}
                        >
                          <div className={headerNameClassName}>{outputHeader}</div>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onMoveOutputHeader(sourceIndex, -1)}
                          disabled={!hasOutput || orderIndex === 0}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveOutputHeader(sourceIndex, 1)}
                          disabled={!hasOutput || orderIndex === outputOrder.length - 1}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                        >
                          →
                        </button>
                        {hasOutput && (
                          <button
                            type="button"
                            onClick={() => onRemoveOutputHeader(sourceIndex)}
                            className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex-shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800/50 sm:px-4">
          <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">현재 출력 순서</div>
          <div className="flex flex-wrap gap-1.5">
            {outputOrder.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                아직 선택된 항목이 없습니다. 항목을 추가하면 다운로드 파일에 포함됩니다.
              </p>
            ) : (
              outputOrder.map((sourceIndex, orderIndex) => {
                const outputHeader = getOutputHeaderName(sourceIndex);
                return (
                  <span
                    key={`direct-order-chip-${outputHeader}-${sourceIndex}`}
                    className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-[11px] font-medium ${colors.chip}`}
                  >
                    <span className="truncate">
                      {orderIndex + 1}. {outputHeader}
                    </span>
                  </span>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-shrink-0 flex-col gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800 sm:mt-4 sm:flex-row sm:items-end sm:justify-between sm:pt-4">
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            양식을 등록하면 현재 미리보기는 초기화됩니다.
            <span className="hidden sm:inline">
              {' '}
              등록 후 같은 형식의 주문파일을 다시 업로드하면, 설정한 헤더명과 출력 순서대로 변환됩니다.
            </span>
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-auto"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onCreateFormat}
              className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 sm:w-auto"
            >
              사용자 지정양식 저장
            </button>
          </div>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
