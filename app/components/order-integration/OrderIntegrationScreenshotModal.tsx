'use client';

import { useEffect, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Upload, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 이미지 붙여넣기 직후 호출 (OCR은 부모의 텍스트 정리 모달에서 진행) */
  onImagePasted: (blob: Blob) => void;
};

/**
 * 택배변환과 동일 — 캡처 화면 붙여넣기 모달.
 * 붙여넣기만 받고, OCR·텍스트 반영은 부모에서 처리합니다.
 */
export function OrderIntegrationScreenshotModal({ open, onClose, onImagePasted }: Props) {
  const pasteAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => pasteAreaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const clearPasteArea = () => {
    if (pasteAreaRef.current) {
      pasteAreaRef.current.textContent = '';
      pasteAreaRef.current.innerHTML = '';
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          onClose();
          onImagePasted(blob);
        }
        return;
      }
    }

    clearPasteArea();
  };

  const handleInput = (_event: FormEvent<HTMLDivElement>) => {
    clearPasteArea();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isPasteShortcut =
      event.key.toLowerCase() === 'v' && (event.ctrlKey || event.metaKey);
    if (!isPasteShortcut) {
      event.preventDefault();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-lg bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">스크린샷 주문변환</h3>
          <button
            type="button"
            onClick={onClose}
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
          contentEditable
          suppressContentEditableWarning
          onPaste={handlePaste}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className="mb-4 min-h-[300px] w-full cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 transition-colors hover:border-blue-400"
          style={{ outline: 'none', userSelect: 'none' }}
        >
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Upload className="mb-4 h-12 w-12 text-gray-400" />
            <p className="mb-2 text-sm font-medium text-gray-700">이미지를 붙여넣으세요</p>
            <p className="text-xs text-gray-500">Ctrl + V 또는 우클릭 → 붙여넣기</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm transition-colors hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
