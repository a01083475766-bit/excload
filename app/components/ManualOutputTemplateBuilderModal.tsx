'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { MANUAL_TEMPLATE_HEADER_EXAMPLES } from '@/app/lib/manual-output-template-builder';

type AccentColor = 'blue' | 'emerald';

type ManualOutputTemplateBuilderModalProps = {
  open: boolean;
  headers: string[];
  activeIndex: number;
  exampleQuery: string;
  accent?: AccentColor;
  onClose: () => void;
  onHeaderChange: (index: number, value: string) => void;
  onActiveIndexChange: (index: number) => void;
  onAddHeader: () => void;
  onRemoveHeader: (index: number) => void;
  onInsertExample: (example: string) => void;
  onExampleQueryChange: (value: string) => void;
  onCreate: () => void;
};

const accentClassMap = {
  blue: {
    primaryButton: 'bg-blue-600 hover:bg-blue-700',
    activeHeader:
      'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
    activeCell: 'border-blue-300 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/30',
    activeInput: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
    guideText: 'text-blue-700 dark:text-blue-200',
    enteredChip: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
    exampleHover:
      'hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-950/50 dark:hover:text-blue-200',
  },
  emerald: {
    primaryButton: 'bg-emerald-600 hover:bg-emerald-700',
    activeHeader:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    activeCell: 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30',
    activeInput: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40',
    guideText: 'text-emerald-700 dark:text-emerald-200',
    enteredChip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    exampleHover:
      'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-200',
  },
} as const;

export function ManualOutputTemplateBuilderModal({
  open,
  headers,
  activeIndex,
  exampleQuery,
  accent = 'blue',
  onClose,
  onHeaderChange,
  onActiveIndexChange,
  onAddHeader,
  onRemoveHeader,
  onInsertExample,
  onExampleQueryChange,
  onCreate,
}: ManualOutputTemplateBuilderModalProps) {
  const accentClasses = accentClassMap[accent];

  const filteredExamples = useMemo(() => {
    const query = exampleQuery.replace(/\s/g, '').trim().toLowerCase();
    if (!query) return MANUAL_TEMPLATE_HEADER_EXAMPLES;
    return MANUAL_TEMPLATE_HEADER_EXAMPLES.filter((example) =>
      example.replace(/\s/g, '').toLowerCase().includes(query),
    );
  }, [exampleQuery]);

  const enteredHeaders = useMemo(
    () =>
      headers
        .map((header, index) => ({
          index,
          name: header.trim(),
        }))
        .filter((header) => header.name !== ''),
    [headers],
  );

  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      aria-labelledby="manual-template-builder-title"
      panelClassName="w-full max-w-[1482px]"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-[1482px] h-[88vh] sm:h-[84vh] flex flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h2
            id="manual-template-builder-title"
            className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            내 출력 양식 만들기
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        <div className="mb-6 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            자주 사용하는 엑셀 형식을 직접 만들어 보세요.
            <br />
            택배사 업로드 파일뿐 아니라 거래처 제출용, 자체 관리용 등 원하는 엑셀 양식을 자유롭게 만들 수 있습니다.
            <br />
            매번 복사·붙여넣기하거나 셀을 옮길 필요 없이 주문 데이터를 원하는 형태로 자동 정리합니다.
            <br />
            원하는 열 순서만 한 번 설정하면 앞으로는 주문 파일을 자동으로 같은 형식으로 변환합니다.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[400px] pb-2">
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  헤더명 입력
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  열 순서는 다운로드될 다운로드 파일의 열 순서로 사용됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onAddHeader}
                className={`min-w-[120px] rounded-lg px-5 py-2 text-sm font-medium text-white ${accentClasses.primaryButton}`}
              >
                셀추가 +
              </button>
            </div>

            <div className="overflow-x-auto p-4 preview-scrollbar">
              <table className="min-w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="bg-zinc-100 dark:bg-zinc-800">
                    {headers.map((_, index) => (
                      <th
                        key={`manual-template-modal-heading-${index}`}
                        className={`min-w-[220px] border px-3 py-2 text-left font-semibold transition-colors ${
                          activeIndex === index
                            ? accentClasses.activeHeader
                            : 'border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {index + 1}. 헤더명 입력
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {headers.map((header, index) => (
                      <td
                        key={`manual-template-modal-input-${index}`}
                        className={`min-w-[220px] border p-2 transition-colors ${
                          activeIndex === index
                            ? accentClasses.activeCell
                            : 'border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={header}
                            onFocus={() => onActiveIndexChange(index)}
                            onChange={(e) => onHeaderChange(index, e.target.value)}
                            placeholder="예: 받는 사람"
                            className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:text-zinc-100 dark:focus:ring-blue-950 ${
                              activeIndex === index
                                ? accentClasses.activeInput
                                : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950'
                            }`}
                          />
                          {headers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveHeader(index)}
                              className="h-10 w-8 rounded-md border border-zinc-300 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                              aria-label="헤더 입력칸 삭제"
                            >
                              X
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <span className="font-medium">
                현재 선택 칸: {activeIndex + 1}번째
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="text-zinc-500 dark:text-zinc-400">
                  현재까지 입력:
                </span>
                {enteredHeaders.length > 0 ? (
                  enteredHeaders.map((header) => (
                    <span
                      key={`${header.index}-${header.name}`}
                      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${accentClasses.enteredChip}`}
                    >
                      {header.index + 1}. {header.name}(지정)
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-400 dark:text-zinc-500">
                    아직 입력된 헤더가 없습니다.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  입력 예시
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    예시문을 선택하거나 참고하여 직접 입력하세요.
                  </p>
                  <p className={`text-sm font-semibold ${accentClasses.guideText}`}>
                    보내는분 / 연락처 / 상품명 등 보편적으로 사용하는 이름을 권장합니다.
                  </p>
                </div>
              </div>
              <input
                type="text"
                value={exampleQuery}
                onChange={(e) => onExampleQueryChange(e.target.value)}
                placeholder="예시 검색: 주소, 전화, 상품"
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-blue-950 sm:w-[280px]"
              />
            </div>

            <div className="h-[260px] overflow-y-auto">
              {filteredExamples.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {filteredExamples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => onInsertExample(example)}
                      className={`rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${accentClasses.exampleHover}`}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  검색 결과가 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onCreate}
            className={`px-4 py-2 rounded-lg text-sm text-white font-medium ${accentClasses.primaryButton}`}
          >
            완료
          </button>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
