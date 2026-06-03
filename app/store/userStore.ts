/**
 * 사용자 정보 Zustand Store
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearAllPreviewWorkspacesInTab } from '@/app/lib/preview-workspace-session';

export type Plan = 'FREE' | 'PRO' | 'YEARLY';

export interface User {
  userId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  plan: Plan;
  points: number;
  lastLoginProvider?: 'CREDENTIALS' | 'GOOGLE' | 'KAKAO' | 'NAVER' | 'UNKNOWN' | string;
  monthlyPoints?: number;
  lastMonthlyGrant?: string | null;
  nextPointDate?: string | null;
  /** DB User.createdAt (가입일) */
  createdAt?: string | null;
  feedbackTrialEndsAt?: string | null;
  feedbackTrialUsed?: boolean;
}

interface UserStoreState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  updatePoints: (points: number, monthlyPoints?: number, nextPointDate?: string | null) => void;
  clearUser: () => void;
  fetchUser: () => Promise<void>;
  grantMonthlyPoints: () => Promise<void>;
}

export const useUserStore = create<UserStoreState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,

      setUser: (user) => {
        set({ user });
      },

      updatePoints: (points, monthlyPoints, nextPointDate) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              points,
              monthlyPoints: monthlyPoints ?? currentUser.monthlyPoints,
              nextPointDate: nextPointDate ?? currentUser.nextPointDate ?? null,
            },
          });
        }
      },

      clearUser: () => {
        clearAllPreviewWorkspacesInTab();
        set({ user: null });
      },

      fetchUser: async () => {
        const hadUser = Boolean(get().user);
        if (!hadUser) {
          set({ isLoading: true });
        }
        try {
          const response = await fetch('/api/user/get', {
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              set({
                user: {
                  userId: data.user.id,
                  email: data.user.email,
                  name: data.user.name,
                  phone: data.user.phone,
                  plan: data.user.plan,
                  points: data.user.points,
                  lastLoginProvider: data.user.lastLoginProvider,
                  monthlyPoints: data.user.monthlyPoints,
                  lastMonthlyGrant: data.user.lastMonthlyGrant,
                  nextPointDate: data.user.nextPointDate,
                  createdAt: data.user.createdAt ?? null,
                  feedbackTrialEndsAt: data.user.feedbackTrialEndsAt ?? null,
                  feedbackTrialUsed: data.user.feedbackTrialUsed ?? false,
                },
              });

              // 사용자 정보 조회 후 자동으로 월간 사용량 제공 확인
              await get().grantMonthlyPoints();
            } else {
              set({ user: null });
            }
          } else {
            set({ user: null });
          }
        } catch (error) {
          console.error('[User Store] 사용자 정보 조회 실패:', error);
          set({ user: null });
        } finally {
          set({ isLoading: false });
        }
      },

      grantMonthlyPoints: async () => {
        const currentUser = get().user;
        if (!currentUser) {
          return;
        }

        try {
          // nextPointDate 도달 시 지급 API 호출
          const now = new Date();
          const nextPointDate = currentUser.nextPointDate
            ? new Date(currentUser.nextPointDate)
            : null;

          if (nextPointDate && nextPointDate > now) {
            return;
          }

          // 월간 사용량 제공 API 호출
          const response = await fetch('/api/user/grant-monthly-points', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              // Zustand store 업데이트
              set({
                user: {
                  ...currentUser,
                  points: data.user.points,
                  monthlyPoints: data.user.monthlyPoints,
                  lastMonthlyGrant: data.user.lastMonthlyGrant,
                  nextPointDate: data.user.nextPointDate ?? currentUser.nextPointDate ?? null,
                },
              });
            }
          }
        } catch (error) {
          console.error('[User Store] 월간 사용량 제공 실패:', error);
          // 월간 사용량 제공 실패는 치명적이지 않으므로 조용히 처리
        }
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
