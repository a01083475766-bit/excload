'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useHistoryStore } from '@/app/store/historyStore';
import { useUploadedFilesStore } from '@/app/lib/stores/uploadedFilesStore';

export default function StoreInitializer() {
  const loadSessions = useHistoryStore((state) => state.loadSessions);
  const loadMetadata = useUploadedFilesStore((state) => state.loadMetadata);
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  
  // uploadedFiles.excel과 currentFilePreviewData 값 추적
  const uploadedFiles = useUploadedFilesStore((state) => state.files.excel);
  const currentFilePreviewData = useUploadedFilesStore((state) => state.currentFilePreviewData);
  
  // /contact 진입 직전의 값들을 저장하기 위한 ref
  const beforeContactEntryRef = useRef<{
    uploadedFiles: typeof uploadedFiles;
    currentFilePreviewData: typeof currentFilePreviewData;
  } | null>(null);

  useEffect(() => {
    // 앱 초기화 시 히스토리 세션과 파일 메타데이터 로드
    // 실행 타이밍: 앱 최초 마운트 시 (StoreInitializer 컴포넌트가 렌더링될 때)
    // loadSessions() 호출 시 내부적으로 loadSessionsFromStorage()가 실행되며,
    // 이때 히스토리 정리 로직(30일 이상 된 항목 자동 삭제)이 함께 실행됨
    loadSessions();
    loadMetadata();
  }, [loadSessions, loadMetadata]);

  // 경로 변경 감지 (pathname만 추적)
  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    const currentPathname = pathname;
    
    // /contact로 진입하는 경우 - 진입 직전 값 저장
    if (currentPathname === '/contact' && prevPathname !== '/contact') {
      // 현재 값들을 저장 (진입 직전 상태)
      beforeContactEntryRef.current = {
        uploadedFiles: [...uploadedFiles],
        currentFilePreviewData: [...currentFilePreviewData],
      };
    }
    
    prevPathnameRef.current = currentPathname;
  }, [pathname]);

  // /contact 진입 후 값 변경 감지 (uploadedFiles와 currentFilePreviewData 추적)
  useEffect(() => {
    // /contact 페이지에 있는 경우에만 비교
    if (pathname === '/contact' && beforeContactEntryRef.current) {
      // 비교 완료 후 ref 초기화 (다음 진입을 위해)
      beforeContactEntryRef.current = null;
    }
  }, [pathname, uploadedFiles, currentFilePreviewData]);


  return null;
}


