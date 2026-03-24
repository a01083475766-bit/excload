'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [isRefreshing, setIsRefreshing] = useState(true);
  
  const fetchUser = useUserStore((state) => state.fetchUser);
  const user = useUserStore((state) => state.user);

  useEffect(() => {
    const refreshUserData = async () => {
      try {
        // 사용자 정보 갱신
        await fetchUser();
        
        // 라우터 새로고침으로 서버 컴포넌트도 갱신
        router.refresh();
        
        // 잠시 대기 후 마이페이지로 이동
        setTimeout(() => {
          setIsRefreshing(false);
          router.push('/mypage');
        }, 2000);
      } catch (error) {
        console.error('[Payment Success] 사용자 정보 갱신 실패:', error);
        setIsRefreshing(false);
        // 에러가 발생해도 성공 페이지는 표시
        setTimeout(() => {
          router.push('/mypage');
        }, 2000);
      }
    };

    refreshUserData();
  }, [fetchUser, router]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-8 text-center">
        {isRefreshing ? (
          <>
            <Loader2 className="w-16 h-16 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              결제 처리 중...
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              사용자 정보를 갱신하고 있습니다.
            </p>
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 text-green-600 dark:text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
              결제가 완료되었습니다!
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              플랜과 포인트가 업데이트되었습니다.
            </p>
            {user && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">현재 플랜</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {user.plan === 'PRO' ? '프로' : user.plan === 'YEARLY' ? '연간' : '무료'}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 mb-1">보유 포인트</p>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  {user.points.toLocaleString()}P
                </p>
              </div>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              잠시 후 마이페이지로 이동합니다...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
