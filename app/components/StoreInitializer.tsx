'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useHistoryStore } from '@/app/store/historyStore';
import { useUploadedFilesStore } from '@/app/lib/stores/uploadedFilesStore';
import { useUserStore } from '@/app/store/userStore';
import {
  clearAllPreviewWorkspacesInTab,
  setPreviewWorkspacePersistenceSuppressed,
} from '@/app/lib/preview-workspace-session';

export default function StoreInitializer() {
  const { status, data: session } = useSession();
  const setHistoryUserId = useHistoryStore((state) => state.setHistoryUserId);
  const loadSessions = useHistoryStore((state) => state.loadSessions);
  const clearSessionsInMemory = useHistoryStore((state) => state.clearSessionsInMemory);
  const syncUploadedFilesMetadataScope = useUploadedFilesStore((state) => state.syncUploadedFilesMetadataScope);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const uploadMetaIsLoading = useUserStore((state) => state.isLoading);
  const uploadMetaUserId = useUserStore((state) => state.user?.userId ?? null);
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const prevPreviewScopeUserIdRef = useRef<string | null>(null);
  
  // uploadedFiles.excel과 currentFilePreviewData 값 추적
  const uploadedFiles = useUploadedFilesStore((state) => state.files.excel);
  const currentFilePreviewData = useUploadedFilesStore((state) => state.currentFilePreviewData);
  
  // /contact 진입 직전의 값들을 저장하기 위한 ref
  const beforeContactEntryRef = useRef<{
    uploadedFiles: typeof uploadedFiles;
    currentFilePreviewData: typeof currentFilePreviewData;
  } | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      setHistoryUserId(session.user.id);
      loadSessions();
    }
    if (status === 'unauthenticated') {
      setHistoryUserId(null);
      clearSessionsInMemory();
      clearAllPreviewWorkspacesInTab();
    }
    if (status === 'authenticated') {
      setPreviewWorkspacePersistenceSuppressed(false);
    }
  }, [
    status,
    session?.user?.id,
    setHistoryUserId,
    loadSessions,
    clearSessionsInMemory,
  ]);

  // 세션 해석 후에만 DB 유저와 업로드 스토어 스코프를 맞춘다 (persist user vs session 레이스 완화)
  useEffect(() => {
    if (status === 'loading') return;
    void fetchUser();
  }, [status, fetchUser]);

  useEffect(() => {
    if (status === 'loading') return;
    if (uploadMetaIsLoading) return;
    syncUploadedFilesMetadataScope();
  }, [status, uploadMetaIsLoading, uploadMetaUserId, syncUploadedFilesMetadataScope]);

  // 계정 A → B 전환 시 이전 사용자의 변환 작업 세션 제거
  useEffect(() => {
    if (status !== 'authenticated' || !uploadMetaUserId) {
      if (status === 'unauthenticated') {
        prevPreviewScopeUserIdRef.current = null;
      }
      return;
    }
    const prev = prevPreviewScopeUserIdRef.current;
    if (prev && prev !== uploadMetaUserId) {
      clearAllPreviewWorkspacesInTab();
      setPreviewWorkspacePersistenceSuppressed(false);
    }
    prevPreviewScopeUserIdRef.current = uploadMetaUserId;
  }, [status, uploadMetaUserId]);

  // 다른 탭에서 로그인·로그아웃 시 persist(user-store) 변경 → 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'user-store') return;
      void fetchUser();
      syncUploadedFilesMetadataScope();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchUser, syncUploadedFilesMetadataScope]);

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


