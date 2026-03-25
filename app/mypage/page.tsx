'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { User, Mail, Calendar, CreditCard, Settings, Bell, Shield, LogOut } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

export default function MyPage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const isLoading = useUserStore((state) => state.isLoading);
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'billing'>('profile');
  
  // 컴포넌트 마운트 시 사용자 정보 가져오기
  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  const handleLogout = async () => {
    try {
      // NextAuth 세션 종료
      await signOut({ redirect: false });
      // Zustand store에서 사용자 정보 제거
      clearUser();
      // 로그인 페이지로 리다이렉트
      router.push('/auth/login');
      router.refresh();
    } catch (error) {
      console.error('[MyPage] 로그아웃 중 오류:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  // 사용자 정보가 없으면 로그인 페이지로 리다이렉트
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  // 플랜 타입을 한글로 변환
  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'FREE':
        return '무료';
      case 'PRO':
        return '프로';
      case 'YEARLY':
        return '연간';
      default:
        return '무료';
    }
  };

  // 사용자 정보가 없으면 로딩 표시
  if (isLoading || !user) {
    return (
      <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-zinc-600 dark:text-zinc-400">사용자 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 이메일에서 이름 추출 (이메일 앞부분 사용)
  const userName = user.email.split('@')[0] || '사용자';
  
  // 가입일은 임시로 현재 날짜 사용 (실제로는 API에서 가져와야 함)
  const joinDate = new Date().toISOString().split('T')[0];

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-950 dark:text-zinc-100 mb-2">
            마이페이지
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            계정 정보와 설정을 관리할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
          {/* 사이드바 */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 lg:p-6">
              <div className="flex flex-col items-center mb-6 pb-6 border-b border-zinc-200 dark:border-zinc-800">
                <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-3">
                  <User className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  {userName}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {user.email}
                </p>
              </div>

              <nav className="space-y-2">
                {[
                  { id: 'profile', label: '프로필', icon: User },
                  { id: 'settings', label: '설정', icon: Settings },
                  { id: 'billing', label: '결제 정보', icon: CreditCard },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              <button 
                onClick={handleLogout}
                className="w-full mt-6 flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">로그아웃</span>
              </button>
            </div>
          </div>

          {/* 메인 컨텐츠 */}
          <div className="lg:col-span-3">
            {/* 프로필 탭 */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                    프로필 정보
                  </h2>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        이름
                      </label>
                      <input
                        type="text"
                        defaultValue={userName}
                        className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        이메일
                      </label>
                      <input
                        type="email"
                        defaultValue={user.email}
                        disabled
                        className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 cursor-not-allowed"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <Calendar className="w-4 h-4" />
                      <span>가입일: {joinDate}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span>플랜: {getPlanName(user.plan)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span>잔여 포인트: {user.points.toLocaleString()}P</span>
                    </div>
                    
                    <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors">
                      저장하기
                    </button>
                  </div>
                </div>

                {/* 사용량 통계 */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                    사용량 통계
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">잔여 포인트</p>
                      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                        {user.points.toLocaleString()}
                      </p>
                    </div>
                    
                    <div className="p-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">월간 포인트</p>
                      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                        {user.monthlyPoints?.toLocaleString() || '0'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 설정 탭 */}
            {activeTab === 'settings' && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                  설정
                </h2>
                
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">알림 설정</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">이메일 알림을 받습니다</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                      <div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">2단계 인증</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">계정 보안을 강화합니다</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 결제 정보 탭 */}
            {activeTab === 'billing' && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                  결제 정보
                </h2>
                
                <div className="space-y-6">
                  <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">현재 플랜</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">{getPlanName(user.plan)}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-medium">
                        활성
                      </span>
                    </div>
                    <button 
                      onClick={() => router.push('/pricing')}
                      className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
                    >
                      플랜 변경하기
                    </button>
                  </div>
                  
                  <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">결제 수단</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">**** **** **** 1234</p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">만료일: 12/25</p>
                        </div>
                      </div>
                      <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        변경
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
