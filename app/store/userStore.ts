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
  adminTrialEndsAt?: string | null;
}

interface UserStoreState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  updatePoints: (points: number, monthlyPoints?: number, nextPointDate?: string | null) => void;
  clearUser: () => void;
  fetchUser: () => Promise<void>;
  grantMonthlyPoints: () => Promise<void>;
  /** sync-account·월간 지급 백그라운드 작업 완료 후 최신 포인트 반영 */
  prepareForPointCharge: () => Promise<void>;
}

/** 동시에 fetchUser가 여러 곳에서 호출될 때 /api/user/get 중복 방지 */
let fetchUserInFlight: Promise<void> | null = null;
let syncAccountInFlight: Promise<void> | null = null;

function mapApiUserToStoreUser(data: {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  plan: Plan;
  points: number;
  lastLoginProvider?: string | null;
  monthlyPoints?: number;
  lastMonthlyGrant?: string | null;
  nextPointDate?: string | null;
  createdAt?: string | null;
  feedbackTrialEndsAt?: string | null;
  feedbackTrialUsed?: boolean;
  adminTrialEndsAt?: string | null;
}): User {
  return {
    userId: data.id,
    email: data.email,
    name: data.name,
    phone: data.phone,
    plan: data.plan,
    points: data.points,
    lastLoginProvider: data.lastLoginProvider ?? undefined,
    monthlyPoints: data.monthlyPoints,
    lastMonthlyGrant: data.lastMonthlyGrant,
    nextPointDate: data.nextPointDate,
    createdAt: data.createdAt ?? null,
    feedbackTrialEndsAt: data.feedbackTrialEndsAt ?? null,
    feedbackTrialUsed: data.feedbackTrialUsed ?? false,
    adminTrialEndsAt: data.adminTrialEndsAt ?? null,
  };
}

async function runSyncAccountSideEffects(
  set: (partial: Partial<UserStoreState> | ((state: UserStoreState) => Partial<UserStoreState>)) => void,
  get: () => UserStoreState,
): Promise<void> {
  if (syncAccountInFlight) {
    return syncAccountInFlight;
  }

  const run = async () => {
    if (!get().user) return;

    try {
      const response = await fetch('/api/user/sync-account', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          set({ user: mapApiUserToStoreUser(data.user) });
        }
      } else if (response.status === 403) {
        set({ user: null });
        return;
      }
    } catch (error) {
      console.error('[User Store] 계정 동기화 실패:', error);
    }

    void get().grantMonthlyPoints();
  };

  syncAccountInFlight = run().finally(() => {
    syncAccountInFlight = null;
  });
  return syncAccountInFlight;
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
        if (fetchUserInFlight) {
          return fetchUserInFlight;
        }

        const run = async () => {
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
                set({ user: mapApiUserToStoreUser(data.user) });
                void runSyncAccountSideEffects(set, get);
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
        };

        fetchUserInFlight = run().finally(() => {
          fetchUserInFlight = null;
        });
        return fetchUserInFlight;
      },

      grantMonthlyPoints: async () => {
        const currentUser = get().user;
        if (!currentUser) {
          return;
        }

        try {
          const now = new Date();
          const nextPointDate = currentUser.nextPointDate
            ? new Date(currentUser.nextPointDate)
            : null;

          if (nextPointDate && nextPointDate > now) {
            return;
          }

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
        }
      },

      prepareForPointCharge: async () => {
        if (syncAccountInFlight) {
          try {
            await syncAccountInFlight;
          } catch {
            // sync 실패는 use-points 서버 검증에서 재처리
          }
        }
        await get().grantMonthlyPoints();
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
