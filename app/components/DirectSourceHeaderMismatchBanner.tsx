'use client';

type DirectSourceHeaderMismatchBannerProps = {
  missingHeaders: string[];
  onCreateFormatFromFile: () => void;
  onSelectOtherFormat: () => void;
  onDismiss: () => void;
};

export function DirectSourceHeaderMismatchBanner({
  missingHeaders,
  onCreateFormatFromFile,
  onSelectOtherFormat,
  onDismiss,
}: DirectSourceHeaderMismatchBannerProps) {
  if (missingHeaders.length === 0) return null;

  const previewHeaders = missingHeaders.slice(0, 8);
  const restCount = missingHeaders.length - previewHeaders.length;

  return (
    <div
      className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-amber-900">
          선택한 사용자 지정양식과 지금 올린 파일의 헤더가 다릅니다
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
        >
          닫기
        </button>
      </div>
      <p className="mt-1 text-amber-900/90">
        이 양식은 등록할 때 연결한 원본 헤더가 필요합니다. 아래 헤더가 없어 값이 비어 보일 수
        있습니다. 이 파일에 맞게 새 양식을 만들거나, 맞는 양식을 다시 선택해 주세요.
      </p>
      <p className="mt-1.5 break-words text-amber-800">
        없는 헤더:{' '}
        <span className="font-medium">{previewHeaders.join(' · ')}</span>
        {restCount > 0 ? ` 외 ${restCount}개` : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onCreateFormatFromFile}
          className="h-7 rounded border border-blue-600 bg-blue-600 px-2.5 text-[11px] font-medium text-white hover:bg-blue-700"
        >
          이 파일로 새 양식 만들기
        </button>
        <button
          type="button"
          onClick={onSelectOtherFormat}
          className="h-7 rounded border border-zinc-300 bg-white px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          다른 양식 선택
        </button>
      </div>
    </div>
  );
}
