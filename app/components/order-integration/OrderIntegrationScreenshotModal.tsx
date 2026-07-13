'use client';

import { useEffect, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Upload, X } from 'lucide-react';
import {
  EXCLOAD_MODAL_BTN_SECONDARY,
  EXCLOAD_MODAL_OVERLAY,
  EXCLOAD_MODAL_PANEL,
  EXCLOAD_MODAL_TITLE,
} from '@/app/lib/ui/excload-preview-ui';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 이미지 붙여넣기 직후 호출 (OCR은 부모의 텍스트 정리 모달에서 진행) */
  onImagePasted: (blob: Blob) => void;
};

/**
 * 택배변환과 동일 — 캡처 화면 붙여넣기 모달.
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
    <div className={`${EXCLOAD_MODAL_OVERLAY} z-[9999]`} onClick={onClose}>
      <div
        className={`${EXCLOAD_MODAL_PANEL} max-w-[600px]`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 pb-4 pt-5">
          <div className="min-w-0 space-y-1.5">
            <h3 className={EXCLOAD_MODAL_TITLE}>스크린샷 주문변환</h3>
            <p className="text-sm leading-relaxed text-zinc-600">
              주문 화면을 캡처한 뒤 Ctrl + V(또는 Cmd + V)·우클릭 붙여넣기로 넣으세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-zinc-100"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div
            ref={pasteAreaRef}
            tabIndex={0}
            contentEditable
            suppressContentEditableWarning
            onPaste={handlePaste}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="flex min-h-[280px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center transition-colors hover:border-zinc-400"
            style={{ outline: 'none', userSelect: 'none' }}
          >
            <Upload className="mb-3 h-9 w-9 text-zinc-400" />
            <p className="mb-1 text-sm font-medium text-zinc-800">이미지를 붙여넣으세요</p>
            <p className="text-xs text-zinc-500">Ctrl + V / Cmd + V 또는 우클릭 → 붙여넣기</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-zinc-100 px-6 py-4">
          <button type="button" onClick={onClose} className={EXCLOAD_MODAL_BTN_SECONDARY}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
