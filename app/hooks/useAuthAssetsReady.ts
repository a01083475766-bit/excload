'use client';

import { useSession } from 'next-auth/react';
import { useUserStore } from '@/app/store/userStore';

/**
 * NextAuth 세션 해석이 끝났고, 계정별 자산을 다룰 준비가 된 상태인지 반환합니다.
 * persist된 user가 있으면 /api/user/get 갱신 중에도 UI를 먼저 열 수 있으나,
 * 세션 userId와 store userId가 다르면(계정 전환 중) false로 유지합니다.
 */
export function useAuthAssetsReady(): boolean {
  const { status, data: session } = useSession();
  const user = useUserStore((state) => state.user);
  const userLoading = useUserStore((state) => state.isLoading);

  if (status === 'loading') return false;
  if (status === 'unauthenticated') return true;

  const sessionUserId = session?.user?.id ? String(session.user.id) : null;
  if (sessionUserId && user?.userId && sessionUserId !== user.userId) {
    return false;
  }

  if (!userLoading) return true;
  return Boolean(user);
}
