'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type WorkspaceBlockingModalOverlayProps = {
  open: boolean;
  children: ReactNode;
  /** 기본 false — 배경 클릭으로 닫지 않음 (묶음배송 모달과 동일) */
  closeOnBackdropClick?: boolean;
  onBackdropClick?: () => void;
  zIndexClass?: string;
  overlayClassName?: string;
  /** body 포털 루트에 붙는 테마 class (예: blue-unified-theme) */
  themeWrapperClassName?: string;
  /** 내부 패널(모달 본문)에 붙는 className */
  panelClassName?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * 작업 중 배경을 흐리게 막고, 뒤 페이지 클릭·스크롤을 차단하는 모달 오버레이.
 * document.body 포털 + z-[60]으로 미리보기·헤더 위에 고정합니다.
 */
export function WorkspaceBlockingModalOverlay({
  open,
  children,
  closeOnBackdropClick = false,
  onBackdropClick,
  zIndexClass = 'z-[60]',
  overlayClassName = '',
  themeWrapperClassName = '',
  panelClassName = '',
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
}: WorkspaceBlockingModalOverlayProps) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const overlay = (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/45 p-4 ${themeWrapperClassName} ${overlayClassName}`}
      role="presentation"
      onClick={closeOnBackdropClick ? onBackdropClick : undefined}
    >
      <div
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }

  return overlay;
}
