'use client';

import { FileSpreadsheet, X } from 'lucide-react';

interface OutputAreaProps {
  selectedFiles: File[];
  currentFilePreviewData: unknown[];
  handleRemoveFile: (index: number) => void;
}

export default function OutputArea({
  selectedFiles,
  currentFilePreviewData,
  handleRemoveFile,
}: OutputAreaProps) {
  return (
    <div className="h-[260px] min-h-[260px] max-h-[260px] overflow-hidden">
      <div className="h-full flex flex-col">
        {selectedFiles.length === 0 && currentFilePreviewData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-600 text-sm">
              업로드된 파일이 없습니다
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4">
              {/* 파일 리스트 */}
              {selectedFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    업로드된 파일 ({selectedFiles.length}개)
                  </h3>
                  <div className="grid grid-cols-3 gap-3 auto-rows-[56px]">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 h-[56px] min-h-[56px] max-h-[56px]"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-zinc-500 dark:text-zinc-500 flex-shrink-0" />
                        <span className="text-sm text-zinc-900 dark:text-zinc-100 truncate flex-1 min-w-0">
                          {file.name}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="ml-1 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0"
                          aria-label="파일 제거"
                        >
                          <X className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 결과 데이터 요약 */}
              {currentFilePreviewData.length > 0 && (
                <div>
                  <div className="text-sm text-gray-600">
                    {/* 결과 데이터 요약 내용 */}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
