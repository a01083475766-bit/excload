'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { User, Calendar, CreditCard, Settings, Bell, Shield, LogOut } from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

interface SubscriptionState {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface TossCardState {
  hasBillingKey: boolean;
  cardSummary: string | null;
}

interface RefundState {
  hasPendingRefund: boolean;
  createdAt: string | null;
}

export default function MyPage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const isLoading = useUserStore((state) => state.isLoading);
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'billing'>('profile');
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    status: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
  const [tossCardState, setTossCardState] = useState<TossCardState>({
    hasBillingKey: false,
    cardSummary: null,
  });
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);
  const [refundState, setRefundState] = useState<RefundState>({
    hasPendingRefund: false,
    createdAt: null,
  });
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundGuideMessage, setRefundGuideMessage] = useState('');
  const [refundBankName, setRefundBankName] = useState('');
  const [refundAccountNumber, setRefundAccountNumber] = useState('');
  const [refundAccountHolder, setRefundAccountHolder] = useState('');
  const [refundReplyEmail, setRefundReplyEmail] = useState('');
  
  // 컴포넌트 마운트 시 사용자 정보를 항상 새로 가져와 최신 포인트/플랜 동기화
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

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

  useEffect(() => {
    if (!user) return;
    const loadSubscriptionState = async () => {
      try {
        const response = await fetch('/api/user/subscription-status', {
          credentials: 'include',
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.success && data?.subscription) {
          setSubscriptionState({
            status: data.subscription.status,
            cancelAtPeriodEnd: !!data.subscription.cancelAtPeriodEnd,
            currentPeriodEnd: data.subscription.currentPeriodEnd,
          });
        }
      } catch (error) {
        console.error('[MyPage] 구독 상태 조회 실패:', error);
      }
    };
    loadSubscriptionState();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadRefundState = async () => {
      try {
        const response = await fetch('/api/user/refund-status', {
          credentials: 'include',
        });
        if (!response.ok) return;
        const data = await response.json();
        setRefundState({
          hasPendingRefund: !!data?.hasPendingRefund,
          createdAt: data?.refundRequest?.createdAt ?? null,
        });
      } catch (error) {
        console.error('[MyPage] 환불 상태 조회 실패:', error);
      }
    };
    loadRefundState();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadTossCardState = async () => {
      try {
        const response = await fetch('/api/toss/card', {
          credentials: 'include',
        });
        if (!response.ok) {
          setTossCardState({ hasBillingKey: false, cardSummary: null });
          return;
        }
        const data = await response.json();
        setTossCardState({
          hasBillingKey: !!data?.hasBillingKey,
          cardSummary: typeof data?.cardSummary === 'string' ? data.cardSummary : null,
        });
      } catch {
        setTossCardState({ hasBillingKey: false, cardSummary: null });
      }
    };
    loadTossCardState();
  }, [user]);

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

  const currentPeriodEndText = subscriptionState.currentPeriodEnd
    ? new Date(subscriptionState.currentPeriodEnd).toLocaleDateString('ko-KR')
    : null;

  const hasPaidPlan = !!user && (user.plan === 'PRO' || user.plan === 'YEARLY');

  const handleSubscriptionToggle = async () => {
    if (!hasPaidPlan) return;
    try {
      setIsUpdatingSubscription(true);
      const action = subscriptionState.cancelAtPeriodEnd ? 'resume' : 'cancel';
      // Stripe 구독 상태가 있으면 Stripe API, 없으면 일반 해지예약 API를 사용
      const endpoint = subscriptionState.status
        ? '/api/stripe/cancel-subscription'
        : '/api/subscription/cancel-reservation';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error || '구독 상태 변경에 실패했습니다.');
        return;
      }
      setSubscriptionState((prev) => ({
        ...prev,
        cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
        currentPeriodEnd: data.currentPeriodEnd ?? prev.currentPeriodEnd,
      }));
      await fetchUser();
      alert(
        data.cancelAtPeriodEnd
          ? '해지가 예약되었습니다. 다음 결제일부터 자동 결제가 중단됩니다.'
          : '해지 예약이 취소되었습니다.'
      );
    } catch (error) {
      console.error('[MyPage] 구독 해지/복원 실패:', error);
      alert('구독 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingSubscription(false);
    }
  };

  const handleRefundRequest = async () => {
    if (refundState.hasPendingRefund) {
      alert('이미 환불 신청이 접수되어 검토 중입니다.');
      return;
    }

    const ok = window.confirm(
      '환불 신청 정보를 입력하면 접수됩니다.\n검토 후 영업일 기준 3~5일 내 회신 이메일로 안내드립니다.\n진행하시겠습니까?'
    );
    if (!ok) return;

    setRefundGuideMessage(
      '환불 신청은 접수 후 순차 검토됩니다. 처리 결과는 회신 이메일로 안내드립니다.'
    );
    setRefundBankName('');
    setRefundAccountNumber('');
    setRefundAccountHolder('');
    setRefundReplyEmail(user?.email || '');
    setShowRefundModal(true);
  };

  const submitManualRefund = async () => {
    const bankName = refundBankName.trim();
    const accountNumber = refundAccountNumber.trim();
    const accountHolder = refundAccountHolder.trim();
    const replyEmail = refundReplyEmail.trim();

    if (!bankName || !accountNumber || !accountHolder || !replyEmail) {
      alert('은행명, 계좌번호, 예금주, 회신 이메일을 모두 입력해 주세요.');
      return;
    }

    try {
      setIsRequestingRefund(true);
      const requestResponse = await fetch('/api/stripe/request-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bankName,
          accountNumber,
          accountHolder,
          replyEmail,
        }),
      });
      const requestData = await requestResponse.json();
      if (!requestResponse.ok) {
        alert(requestData?.error || '수동 환불 신청 처리 중 오류가 발생했습니다.');
        return;
      }

      setShowRefundModal(false);
      setRefundState({
        hasPendingRefund: true,
        createdAt: new Date().toISOString(),
      });
      alert(
        requestData?.message ||
          '환불 신청이 접수되었습니다. 영업일 기준 3~5일 내 처리 결과를 안내드립니다.'
      );
      await fetchUser();
      router.refresh();
    } catch (error) {
      console.error('[MyPage] 수동 환불 신청 실패:', error);
      alert('수동 환불 신청 처리 중 오류가 발생했습니다.');
    } finally {
      setIsRequestingRefund(false);
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
                    
                    {hasPaidPlan ? (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {subscriptionState.cancelAtPeriodEnd
                            ? `해지 예약 상태 · 서비스 이용 종료일 ${currentPeriodEndText ?? '-'}`
                            : `정기결제 활성 · 다음 결제 예정일 ${currentPeriodEndText ?? '-'}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleSubscriptionToggle}
                            disabled={isUpdatingSubscription}
                            className={`px-6 py-3 rounded-lg transition-colors text-sm font-semibold ${
                              subscriptionState.cancelAtPeriodEnd
                                ? 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                : 'border border-rose-300 text-rose-700 hover:bg-rose-50'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {isUpdatingSubscription
                              ? '처리 중...'
                              : subscriptionState.cancelAtPeriodEnd
                                ? '해지 예약 취소'
                                : '정기결제 해지 예약'}
                          </button>
                          <button
                            onClick={handleRefundRequest}
                            disabled={isRequestingRefund || refundState.hasPendingRefund}
                            className="px-6 py-3 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isRequestingRefund
                              ? '확인 중...'
                              : refundState.hasPendingRefund
                                ? '환불 신청 완료'
                                : '환불 신청하기'}
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {refundState.hasPendingRefund
                            ? `환불 신청이 접수되어 검토 중입니다${refundState.createdAt ? ` (${new Date(refundState.createdAt).toLocaleDateString('ko-KR')} 접수)` : ''}. 신청 시점에 잔여 포인트는 차감(보류) 처리됩니다.`
                            : '환불은 신청 접수 후 정책 기준에 따라 검토·처리되며, 신청 시점에 잔여 포인트는 차감(보류) 처리됩니다. 결과는 회신 이메일로 안내됩니다.'}
                        </p>
                      </div>
                    ) : null}
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
                        {hasPaidPlan && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            프로필 탭에서 해지 예약/취소를 관리할 수 있습니다.
                          </p>
                        )}
                      </div>
                      <span className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-sm font-medium">
                        {subscriptionState.cancelAtPeriodEnd ? '해지예약' : '활성'}
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
                          {tossCardState.hasBillingKey ? (
                            <>
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                                {tossCardState.cardSummary || '등록된 카드'}
                              </p>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                자동결제용 카드가 등록되어 있습니다.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">등록된 결제카드 없음</p>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                구독 페이지에서 카드 등록 후 결제를 진행해 주세요.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/subscribe?plan=${user.plan === 'YEARLY' ? 'yearly' : 'monthly'}`)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {tossCardState.hasBillingKey ? '카드 변경' : '카드 등록'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      {showRefundModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">수동 환불 신청</h3>
            <p className="text-sm text-zinc-600 mb-4 leading-relaxed">
              {refundGuideMessage || '환불 신청 정보를 입력해 주세요.'}
            </p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="은행명"
                value={refundBankName}
                onChange={(e) => setRefundBankName(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="계좌번호"
                value={refundAccountNumber}
                onChange={(e) => setRefundAccountNumber(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="예금주명"
                value={refundAccountHolder}
                onChange={(e) => setRefundAccountHolder(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                placeholder="회신 이메일"
                value={refundReplyEmail}
                onChange={(e) => setRefundReplyEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitManualRefund}
                disabled={isRequestingRefund}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isRequestingRefund ? '신청 중...' : '환불 신청하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
