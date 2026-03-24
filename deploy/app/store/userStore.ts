/**
 * 사용자 정보 Zustand Store
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Plan = 'FREE' | 'PRO' | 'YEARLY';

export interface User {
  userId: string;
  email: string;
  plan: Plan;
  points: number;
  monthlyPoints?: number;
  lastMonthlyGrant?: string | null;
}

interface UserStoreState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  updatePoints: (points: number, monthlyPoints?: number) => void;
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

      updatePoints: (points, monthlyPoints) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              points,
              monthlyPoints: monthlyPoints ?? currentUser.monthlyPoints,
            },
          });
        }
      },

      clearUser: () => {
        set({ user: null });
      },

      fetchUser: async () => {
        set({ isLoading: true });
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
                  plan: data.user.plan,
                  points: data.user.points,
                  monthlyPoints: data.user.monthlyPoints,
                  lastMonthlyGrant: data.user.lastMonthlyGrant,
                },
              });

              // 사용자 정보 조회 후 자동으로 월 포인트 지급 확인
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
          // 이번 달 지급 여부 확인
          const now = new Date();
          const lastGrant = currentUser.lastMonthlyGrant 
            ? new Date(currentUser.lastMonthlyGrant) 
            : null;

          // 이번 달 지급 여부 확인
          const shouldGrant = !lastGrant || 
            lastGrant.getFullYear() < now.getFullYear() || 
            lastGrant.getMonth() < now.getMonth();

          if (!shouldGrant) {
            // 이미 이번 달 지급됨
            return;
          }

          // 월 포인트 지급 API 호출
          const response = await fetch('/api/user/grant-monthly-points', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user && !data.alreadyGranted) {
              // Zustand store 업데이트
              set({
                user: {
                  ...currentUser,
                  points: data.user.points,
                  monthlyPoints: data.user.monthlyPoints,
                  lastMonthlyGrant: data.user.lastMonthlyGrant,
                },
              });
            }
          }
        } catch (error) {
          console.error('[User Store] 월 포인트 지급 실패:', error);
          // 월 포인트 지급 실패는 치명적이지 않으므로 조용히 처리
        }
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
