'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Loader2, Upload, X } from 'lucide-react';

type ScreenshotStage = 'idle' | 'processing' | 'completed';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 붙여넣은 이미지 Blob 처리 (OCR·변환은 부모에서) */
  onImagePasted: (blob: Blob) => Promise<void>;
};

/**
 * 택배변환과 동일 UX — 캡처 화면 붙여넣기 모달 (주문연동 허브용).
 */
export function OrderIntegrationScreenshotModal({ open, onClose, onImagePasted }: Props) {
  const pasteAreaRef = useRef<HTMLDivElement | null>(null);
  const cancelledRef = useRef(false);
  const [stage, setStage] = useState<ScreenshotStage>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setStage('idle');
    setPreviewUrl(null);
    setError(null);
    const t = window.setTimeout(() => pasteAreaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleClose = () => {
    if (stage === 'processing') {
      cancelledRef.current = true;
    }
    onClose();
  };

  const processBlob = async (blob: Blob) => {
    cancelledRef.current = false;
    setError(null);
    setStage('processing');
    const url = URL.createObjectURL(blob);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });

    try {
      await onImagePasted(blob);
      if (cancelledRef.current) {
        setStage('idle');
        return;
      }
      setStage('completed');
      onClose();
    } catch (err) {
      if (cancelledRef.current) {
        setStage('idle');
        return;
      }
      setError(err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
      setStage('idle');
    }
  };

  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (stage !== 'idle') return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) await processBlob(blob);
        return;
      }
    }

    if (pasteAreaRef.current) {
      pasteAreaRef.current.textContent = '';
      pasteAreaRef.current.innerHTML = '';
    }
  };

  const handleInput = (_event: FormEvent<HTMLDivElement>) => {
    if (pasteAreaRef.current && stage === 'idle') {
      pasteAreaRef.current.textContent = '';
      pasteAreaRef.current.innerHTML = '';
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (stage !== 'idle') {
      event.preventDefault();
      return;
    }
    if (event.key !== 'v' || !event.ctrlKey) {
      event.preventDefault();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[600px] rounded-lg bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">스크린샷 주문변환</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 transition-colors hover:bg-gray-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="mb-6 space-y-1 text-sm leading-relaxed text-gray-700">
          <p>주문 화면을 먼저 캡처하세요.</p>
          <p>PrintScreen 또는 캡처 도구를 사용한 뒤</p>
          <p>Ctrl + V 또는 마우스 우클릭 → 붙여넣기 하세요.</p>
        </div>

        <div
          ref={pasteAreaRef}
          tabIndex={0}
          contentEditable={stage === 'idle'}
          suppressContentEditableWarning
          onPaste={handlePaste}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className={`mb-4 min-h-[300px] w-full rounded-lg border-2 border-dashed p-6 transition-colors ${
            stage === 'processing'
              ? 'border-blue-500 bg-blue-50'
              : 'cursor-pointer border-gray-300 bg-gray-50 hover:border-blue-400'
          }`}
          style={{ outline: 'none', userSelect: 'none' }}
        >
          {stage === 'idle' && !previewUrl ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Upload className="mb-4 h-12 w-12 text-gray-400" />
              <p className="mb-2 text-sm font-medium text-gray-700">이미지를 붙여넣으세요</p>
              <p className="text-xs text-gray-500">Ctrl + V 또는 우클릭 → 붙여넣기</p>
            </div>
          ) : null}

          {previewUrl ? (
            <div className="relative flex h-full flex-col items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="붙여넣은 이미지"
                className="mb-4 max-h-[400px] max-w-full rounded-lg shadow-md"
              />
              {stage === 'processing' ? (
                <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">주문 데이터를 정리중입니다…</span>
                </div>
              ) : null}
              {stage === 'completed' ? (
                <div className="mt-2 flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="text-sm font-medium">미리보기에 반영했습니다</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            {stage === 'processing' ? '취소' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  );
}
