'use client';

import { useSession } from 'next-auth/react';
import { useUserStore } from '@/app/store/userStore';

/**
 * NextAuth 세션 해석이 끝났고, /api/user/get 조회도 완료된 뒤에만 true입니다.
 * 이전에 persist된 zustand user와 세션이 어긋날 수 있는 구간에서는 false로 남습니다.
 *
 * 계정별 localStorage 복원、업로드 스토어 스코프 동기화、민감한 파이프라인 상태 hydrate 에 사용합니다.
 */
export function useAuthAssetsReady(): boolean {
  const { status } = useSession();
  const userLoading = useUserStore((state) => state.isLoading);
  return status !== 'loading' && !userLoading;
}
