'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';

type AccentColor = 'blue' | 'emerald';

type DirectMappingSampleFileModalProps = {
  open: boolean;
  accent?: AccentColor;
  onClose: () => void;
  onFileProcess: (file: File) => Promise<{ headers: string[]; samples: Record<string, string[]> } | null>;
  onSuccess: (headers: string[], samples: Record<string, string[]>) => void;
};

const accentClassMap = {
  blue: {
    primaryButton: 'bg-blue-600 hover:bg-blue-700',
    dropZone: 'border-blue-200 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 dark:hover:bg-blue-950/40',
    guide: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  },
  emerald: {
    primaryButton: 'bg-emerald-600 hover:bg-emerald-700',
    dropZone: 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40',
    guide: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
} as const;

export function DirectMappingSampleFileModal({
  open,
  accent = 'blue',
  onClose,
  onFileProcess,
  onSuccess,
}: DirectMappingSampleFileModalProps) {
  const accentClasses = accentClassMap[accent];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.zip')) {
      alert('주문 파일은 엑셀(.xlsx, .xls, .zip)만 선택할 수 있습니다.');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onFileProcess(file);
      if (!result || result.headers.length === 0) {
        alert('주문 파일에서 헤더를 찾을 수 없습니다. 다른 파일을 선택해 주세요.');
        return;
      }
      onSuccess(result.headers, result.samples);
    } catch (error) {
      alert(error instanceof Error ? error.message : '주문 파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  return (
    <WorkspaceBlockingModalOverlay
      open={open}
      aria-labelledby="direct-mapping-sample-file-title"
      panelClassName="w-full max-w-xl"
      overlayClassName="p-2 sm:p-4"
    >
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="direct-mapping-sample-file-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 sm:text-xl"
            >
              사용자 지정양식 만들기
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              주문 파일의 헤더를 확인해야 어떤 열을 출력할지 정할 수 있습니다. 자주 쓰는 주문 엑셀
              샘플을 선택해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="shrink-0 rounded-lg p-1 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        <div className={`mb-4 rounded-lg px-3 py-2 text-[13px] leading-relaxed ${accentClasses.guide}`}>
          샘플 파일은 양식 만들기에만 사용됩니다. 등록 후 실제 변환할 주문 파일을 다시 첨부해 주세요.
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.zip"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            isDragging ? accentClasses.dropZone : 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40'
          }`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 text-zinc-600 dark:text-zinc-300">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">주문 파일 헤더를 읽는 중입니다...</p>
            </div>
          ) : (
            <>
              <Upload className="mb-3 h-10 w-10 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                주문 엑셀 파일을 여기에 놓거나 아래 버튼으로 선택하세요
              </p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                .xlsx, .xls, .zip
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`mt-5 w-full rounded-lg px-5 py-3 text-sm font-medium text-white sm:w-auto sm:py-2.5 ${accentClasses.primaryButton}`}
              >
                주문 샘플 파일 선택
              </button>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
