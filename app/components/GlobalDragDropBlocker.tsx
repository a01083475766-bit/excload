'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 전역 drag & drop 기본 동작 차단 컴포넌트
 * 
 * 엑셀 주문 변환 페이지의 드롭존 내부를 제외한 모든 곳에서 파일 드롭을 차단합니다.
 * 드롭존 컴포넌트 내부에서는 stopPropagation으로 인해 이 핸들러가 실행되지 않으므로
 * 드롭존의 drop 이벤트는 정상적으로 작동합니다.
 */
export default function GlobalDragDropBlocker() {
  const pathname = usePathname();

  useEffect(() => {
    // 파일 드래그인지 확인하는 함수
    const isFileDrag = (e: DragEvent): boolean => {
      return Array.from(e.dataTransfer?.types ?? []).some(
        (type) => type === 'Files' || type === 'application/x-moz-file',
      );
    };

    const preventFileNavigation = (e: DragEvent) => {
      // 파일 드래그인 경우에만 처리
      if (isFileDrag(e)) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
      }
    };

    // dragover 이벤트: 기본 동작 차단 (필수 - drop 이벤트가 발생하려면 dragover에서 preventDefault 필요)
    const handleGlobalDragOver = (e: DragEvent) => {
      preventFileNavigation(e);
    };

    // drop 이벤트: 기본 동작 차단 (브라우저 기본 파일 열기/다운로드 방지)
    const handleGlobalDrop = (e: DragEvent) => {
      // 파일 드래그인 경우에만 처리
      if (isFileDrag(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // capture phase에서 먼저 기본 파일 열기 동작을 막고, bubble phase에서 페이지 바깥 드롭을 차단합니다.
    document.addEventListener('dragenter', preventFileNavigation, true);
    document.addEventListener('dragover', preventFileNavigation, true);
    document.addEventListener('drop', preventFileNavigation, true);
    window.addEventListener('dragenter', preventFileNavigation, true);
    window.addEventListener('dragover', preventFileNavigation, true);
    window.addEventListener('drop', preventFileNavigation, true);

    // window 레벨 이벤트 리스너 등록 (bubble phase)
    document.addEventListener('dragover', handleGlobalDragOver, false);
    document.addEventListener('drop', handleGlobalDrop, false);
    window.addEventListener('dragover', handleGlobalDragOver, false);
    window.addEventListener('drop', handleGlobalDrop, false);

    // 컴포넌트 언마운트 시 이벤트 리스너 제거
    return () => {
      document.removeEventListener('dragenter', preventFileNavigation, true);
      document.removeEventListener('dragover', preventFileNavigation, true);
      document.removeEventListener('drop', preventFileNavigation, true);
      window.removeEventListener('dragenter', preventFileNavigation, true);
      window.removeEventListener('dragover', preventFileNavigation, true);
      window.removeEventListener('drop', preventFileNavigation, true);
      document.removeEventListener('dragover', handleGlobalDragOver, false);
      document.removeEventListener('drop', handleGlobalDrop, false);
      window.removeEventListener('dragover', handleGlobalDragOver, false);
      window.removeEventListener('drop', handleGlobalDrop, false);
    };
  }, [pathname]);

  return null;
}

