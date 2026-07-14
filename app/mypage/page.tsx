'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { clearAllPreviewWorkspacesInTab } from '@/app/lib/preview-workspace-session';
import {
  User,
  Calendar,
  CreditCard,
  LogOut,
  AlertTriangle,
  ChevronDown,
  UserX,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { formatPhoneDisplay, formatPhoneForInput } from '@/app/utils/format-phone';
import { FAVORITE_MALLS_KEY, removeLocalStorageForUser } from '@/app/lib/scoped-local-storage';
import { FeedbackTrialActiveBanner } from '@/app/components/feedback-event/FeedbackTrialActiveBanner';

interface SubscriptionState {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

interface PendingPlanChangeState {
  pendingPlan: string;
  pendingPlanLabel: string;
  pendingPlanApplyAtLabel: string | null;
  currentPlanLabel: string;
}

interface TossCardState {
  hasBillingKey: boolean;
  cardSummary: string | null;
  cardCompany: string | null;
  cardNumberMask: string | null;
}

interface PaymentFailureState {
  isPastDue: boolean;
  gracePeriodUntilLabel: string | null;
}

interface RefundState {
  hasPendingRefund: boolean;
  createdAt: string | null;
}

interface PaymentHistoryItem {
  id: string;
  planLabel: string;
  amount: number;
  currency: string;
  paymentProviderLabel: string;
  paidAtLabel: string;
}

interface PointGrantHistoryItem {
  id: string;
  reasonLabel: string;
  change: number;
  grantedAtLabel: string;
}

interface PointUsageHistoryItem {
  id: string;
  reasonLabel: string;
  change: number;
  usedAtLabel: string;
}

export default function MyPage() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const clearUser = useUserStore((state) => state.clearUser);
  const isLoading = useUserStore((state) => state.isLoading);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    status: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
  });
  const [tossCardState, setTossCardState] = useState<TossCardState>({
    hasBillingKey: false,
    cardSummary: null,
    cardCompany: null,
    cardNumberMask: null,
  });
  const [isDeletingCard, setIsDeletingCard] = useState(false);
  const [paymentFailure, setPaymentFailure] = useState<PaymentFailureState>({
    isPastDue: false,
    gracePeriodUntilLabel: null,
  });
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [isLoadingPaymentHistory, setIsLoadingPaymentHistory] = useState(false);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [pointGrantHistory, setPointGrantHistory] = useState<PointGrantHistoryItem[]>([]);
  const [isLoadingPointGrantHistory, setIsLoadingPointGrantHistory] = useState(false);
  const [isPointGrantHistoryOpen, setIsPointGrantHistoryOpen] = useState(false);
  const [pointUsageHistory, setPointUsageHistory] = useState<PointUsageHistoryItem[]>([]);
  const [isLoadingPointUsageHistory, setIsLoadingPointUsageHistory] = useState(false);
  const [isPointUsageHistoryOpen, setIsPointUsageHistoryOpen] = useState(false);
  const [pendingPlanChange, setPendingPlanChange] = useState<PendingPlanChangeState | null>(null);
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const [isCancellingPlanChange, setIsCancellingPlanChange] = useState(false);
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
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawRequiresPassword, setWithdrawRequiresPassword] = useState(true);
  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [showWithdrawPassword, setShowWithdrawPassword] = useState(false);
  const [withdrawConfirmText, setWithdrawConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [nowMs] = useState(() => Date.now());

  // 세션이 확인된 뒤 사용자 정보 동기화
  useEffect(() => {
    if (status === 'authenticated' && !user && !isLoading) {
      void fetchUser();
    }
  }, [status, user, isLoading, fetchUser]);

  const handleLogout = async () => {
    try {
      clearAllPreviewWorkspacesInTab();
      await signOut({ redirect: false });
      clearUser();
      // 홈으로 보내 상단「로그인/회원가입」을 한 번 더 거치게 함(의도적 마찰)
      window.location.href = '/';
    } catch (error) {
      console.error('[MyPage] 로그아웃 중 오류:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };

  const openWithdrawModal = async () => {
    try {
      const response = await fetch('/api/user/delete-account', { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.success) {
        setWithdrawRequiresPassword(!!data.requiresPassword);
      }
    } catch (error) {
      console.error('[MyPage] 탈퇴 확인 정보 조회 실패:', error);
    }
    setWithdrawPassword('');
    setShowWithdrawPassword(false);
    setWithdrawConfirmText('');
    setShowWithdrawModal(true);
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;

    const ok = window.confirm(
      '정말 탈퇴하시겠습니까?\n\n' +
        '· 탈퇴 직후에는 로그인·서비스 이용이 중단됩니다.\n' +
        '· 7일 이내 같은 계정으로 로그인하거나 재가입하면 복구되며, 잔여 사용량이 유지됩니다.\n' +
        '· 7일이 지나면 계정·데이터가 영구 삭제됩니다.',
    );
    if (!ok) return;

    try {
      setIsDeletingAccount(true);
      const response = await fetch('/api/user/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withdrawRequiresPassword
            ? { password: withdrawPassword }
            : { confirmText: withdrawConfirmText },
        ),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data?.error || '회원 탈퇴에 실패했습니다.');
        return;
      }

      if (user?.userId) {
        removeLocalStorageForUser(FAVORITE_MALLS_KEY, user.userId);
      }
      clearAllPreviewWorkspacesInTab();
      setShowWithdrawModal(false);
      await signOut({ redirect: false });
      clearUser();
      window.location.href = '/?withdrawn=1';
    } catch (error) {
      console.error('[MyPage] 회원 탈퇴 실패:', error);
      alert('회원 탈퇴 중 오류가 발생했습니다.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  useEffect(() => {
    setPhoneInput(formatPhoneDisplay(user?.phone ?? undefined));
  }, [user?.phone]);

  useEffect(() => {
    setNicknameInput((user?.name || user?.email?.split('@')[0] || '').trim());
  }, [user?.name, user?.email]);

  // 세션이 명확히 unauthenticated일 때만 로그인 페이지로 이동
  useEffect(() => {
    if (status === 'unauthenticated' && !isLoading && !user) {
      router.push('/auth/login');
    }
  }, [status, user, isLoading, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const loadSubscriptionState = async () => {
      try {
        setIsLoadingSubscription(true);
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
          setPendingPlanChange(data?.pendingPlanChange ?? null);
          const pf = data?.paymentFailure;
          setPaymentFailure({
            isPastDue: !!pf?.isPastDue,
            gracePeriodUntilLabel:
              typeof pf?.gracePeriodUntilLabel === 'string' ? pf.gracePeriodUntilLabel : null,
          });
        }
      } catch (error) {
        console.error('[MyPage] 구독 상태 조회 실패:', error);
      } finally {
        setIsLoadingSubscription(false);
      }
    };
    loadSubscriptionState();
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const loadPointGrantHistory = async () => {
      try {
        setIsLoadingPointGrantHistory(true);
        const response = await fetch('/api/user/point-history', {
          credentials: 'include',
        });
        if (!response.ok) {
          setPointGrantHistory([]);
          return;
        }
        const data = await response.json();
        const items = Array.isArray(data?.points) ? data.points : [];
        setPointGrantHistory(
          items.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ''),
            reasonLabel: typeof p.reasonLabel === 'string' ? p.reasonLabel : '포인트 지급',
            change: typeof p.change === 'number' ? p.change : 0,
            grantedAtLabel: typeof p.grantedAtLabel === 'string' ? p.grantedAtLabel : '',
          }))
        );
      } catch (error) {
        console.error('[MyPage] 포인트 지급 내역 조회 실패:', error);
        setPointGrantHistory([]);
      } finally {
        setIsLoadingPointGrantHistory(false);
      }
    };
    loadPointGrantHistory();
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const loadPointUsageHistory = async () => {
      try {
        setIsLoadingPointUsageHistory(true);
        const response = await fetch('/api/user/point-usage-history', {
          credentials: 'include',
        });
        if (!response.ok) {
          setPointUsageHistory([]);
          return;
        }
        const data = await response.json();
        const items = Array.isArray(data?.usages) ? data.usages : [];
        setPointUsageHistory(
          items.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ''),
            reasonLabel: typeof p.reasonLabel === 'string' ? p.reasonLabel : '포인트 사용',
            change: typeof p.change === 'number' ? p.change : 0,
            usedAtLabel: typeof p.usedAtLabel === 'string' ? p.usedAtLabel : '',
          }))
        );
      } catch (error) {
        console.error('[MyPage] 포인트 사용 내역 조회 실패:', error);
        setPointUsageHistory([]);
      } finally {
        setIsLoadingPointUsageHistory(false);
      }
    };
    loadPointUsageHistory();
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
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
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const loadPaymentHistory = async () => {
      try {
        setIsLoadingPaymentHistory(true);
        const response = await fetch('/api/user/payment-history', {
          credentials: 'include',
        });
        if (!response.ok) {
          setPaymentHistory([]);
          return;
        }
        const data = await response.json();
        const items = Array.isArray(data?.payments) ? data.payments : [];
        setPaymentHistory(
          items.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ''),
            planLabel: typeof p.planLabel === 'string' ? p.planLabel : '구독',
            amount: typeof p.amount === 'number' ? p.amount : 0,
            currency: typeof p.currency === 'string' ? p.currency : 'KRW',
            paymentProviderLabel:
              typeof p.paymentProviderLabel === 'string' ? p.paymentProviderLabel : '-',
            paidAtLabel: typeof p.paidAtLabel === 'string' ? p.paidAtLabel : '',
          }))
        );
      } catch (error) {
        console.error('[MyPage] 결제 내역 조회 실패:', error);
        setPaymentHistory([]);
      } finally {
        setIsLoadingPaymentHistory(false);
      }
    };
    loadPaymentHistory();
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const loadTossCardState = async () => {
      try {
        const response = await fetch('/api/toss/card', {
          credentials: 'include',
        });
        if (!response.ok) {
          setTossCardState({ hasBillingKey: false, cardSummary: null, cardCompany: null, cardNumberMask: null });
          return;
        }
        const data = await response.json();
        setTossCardState({
          hasBillingKey: !!data?.hasBillingKey,
          cardSummary: typeof data?.cardSummary === 'string' ? data.cardSummary : null,
          cardCompany: typeof data?.cardCompany === 'string' ? data.cardCompany : null,
          cardNumberMask: typeof data?.cardNumberMask === 'string' ? data.cardNumberMask : null,
        });
      } catch {
        setTossCardState({ hasBillingKey: false, cardSummary: null, cardCompany: null, cardNumberMask: null });
      }
    };
    loadTossCardState();
  }, [status]);

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

  const getUsageHint = (plan: string) => {
    switch (plan) {
      case 'FREE':
        return '무료 플랜은 매월 지급일에 사용량이 리셋된 뒤 제공분으로 맞춰집니다.';
      case 'PRO':
      case 'YEARLY':
        return '유료 플랜은 결제·갱신 주기에 맞춰 제공된 사용량이 잔여로 표시됩니다.';
      default:
        return '주문·송장 변환 및 다운로드 시 잔여 사용량에서 차감됩니다.';
    }
  };

  const currentPeriodEndText = subscriptionState.currentPeriodEnd
    ? new Date(subscriptionState.currentPeriodEnd).toLocaleDateString('ko-KR')
    : null;

  const accountReady = !!user;
  const accountEmail = user?.email ?? session?.user?.email ?? '';
  const subscribePlanParam = user?.plan === 'YEARLY' ? 'yearly' : 'monthly';
  const hasPaidPlan = accountReady && (user.plan === 'PRO' || user.plan === 'YEARLY');
  const isSessionLoading = status === 'loading';
  const isRedirectingToLogin =
    status === 'unauthenticated' && !isLoading && !user;

  const handleRetryPayment = async () => {
    try {
      setIsRetryingPayment(true);
      const res = await fetch('/api/toss/retry-payment', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || '결제에 실패했습니다. 카드 정보를 확인해 주세요.');
        return;
      }
      alert('결제가 완료되었습니다.');
      setPaymentFailure({ isPastDue: false, gracePeriodUntilLabel: null });
      await fetchUser();
      const statusRes = await fetch('/api/user/subscription-status', { credentials: 'include' });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.subscription) {
          setSubscriptionState({
            status: statusData.subscription.status,
            cancelAtPeriodEnd: !!statusData.subscription.cancelAtPeriodEnd,
            currentPeriodEnd: statusData.subscription.currentPeriodEnd,
          });
        }
        const pf = statusData?.paymentFailure;
        setPaymentFailure({
          isPastDue: !!pf?.isPastDue,
          gracePeriodUntilLabel:
            typeof pf?.gracePeriodUntilLabel === 'string' ? pf.gracePeriodUntilLabel : null,
        });
      }
    } catch (error) {
      console.error('[MyPage] 결제 재시도 실패:', error);
      alert('결제 처리 중 오류가 발생했습니다.');
    } finally {
      setIsRetryingPayment(false);
    }
  };

  const handleCancelPlanChange = async () => {
    if (!pendingPlanChange) return;
    const ok = window.confirm('예약된 플랜 변경을 취소하시겠습니까?');
    if (!ok) return;
    try {
      setIsCancellingPlanChange(true);
      const res = await fetch('/api/user/cancel-plan-change', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || '플랜 변경 예약 취소에 실패했습니다.');
        return;
      }
      setPendingPlanChange(null);
      alert(data?.message || '플랜 변경 예약이 취소되었습니다.');
    } catch (error) {
      console.error('[MyPage] 플랜 변경 예약 취소 실패:', error);
      alert('플랜 변경 예약 취소 중 오류가 발생했습니다.');
    } finally {
      setIsCancellingPlanChange(false);
    }
  };

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

  const handleDeleteCard = async () => {
    if (!tossCardState.hasBillingKey || isDeletingCard) return;

    if (hasPaidPlan) {
      alert(
        '현재 유료 플랜 이용 중입니다.\n\n카드를 삭제해도 구독이 취소되는 것은 아니므로, 무료로 전환하려면 먼저 「정기결제 해지 예약」을 진행해 주세요.'
      );
      return;
    }

    const ok = window.confirm(
      '등록된 결제카드를 삭제하시겠습니까?\n\n무료 플랜에서는 카드 삭제 후 자동결제가 진행되지 않습니다. 다시 구독하려면 카드를 새로 등록해야 합니다.'
    );
    if (!ok) return;

    try {
      setIsDeletingCard(true);
      const response = await fetch('/api/toss/card', {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data?.error || '결제카드 삭제에 실패했습니다.');
        return;
      }
      setTossCardState({
        hasBillingKey: false,
        cardSummary: null,
        cardCompany: null,
        cardNumberMask: null,
      });
      alert('등록된 결제카드가 삭제되었습니다.');
    } catch (error) {
      console.error('[MyPage] 결제카드 삭제 실패:', error);
      alert('결제카드 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeletingCard(false);
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
        alert(requestData?.error || '환불 신청 처리 중 오류가 발생했습니다.');
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
      console.error('[MyPage] 환불 신청 실패:', error);
      alert('환불 신청 처리 중 오류가 발생했습니다.');
    } finally {
      setIsRequestingRefund(false);
    }
  };

  const handleSavePhone = async () => {
    if (!user) return;
    const digits = phoneInput.replace(/[^0-9]/g, '');
    if (!digits) {
      alert('휴대폰 번호를 입력해주세요.');
      return;
    }

    try {
      setIsSavingPhone(true);
      const response = await fetch('/api/user/update-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: digits }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        alert(data?.error || '휴대폰 번호 저장에 실패했습니다.');
        return;
      }
      await fetchUser();
      alert('휴대폰 번호가 저장되었습니다.');
    } catch (error) {
      console.error('[MyPage] 휴대폰 번호 저장 실패:', error);
      alert('휴대폰 번호 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSaveNickname = async () => {
    if (!user) return;
    const nickname = nicknameInput.trim();
    if (nickname.length < 2 || nickname.length > 20) {
      alert('닉네임은 2자 이상 20자 이하로 입력해주세요.');
      return;
    }

    try {
      setIsSavingNickname(true);
      const response = await fetch('/api/user/update-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nickname }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        alert(data?.error || '닉네임 저장에 실패했습니다.');
        return;
      }
      await fetchUser();
      alert('닉네임이 저장되었습니다.');
    } catch (error) {
      console.error('[MyPage] 닉네임 저장 실패:', error);
      alert('닉네임 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingNickname(false);
    }
  };

  const userName = accountReady
    ? (user.name || user.email.split('@')[0] || '사용자').trim()
    : accountEmail
      ? (accountEmail.split('@')[0] || '사용자')
      : '불러오는 중…';

  const joinDateLabel = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    : '—';

  return (
    <div className="pt-12 bg-zinc-50 dark:bg-black min-h-screen">
      <main className="max-w-[1200px] mx-auto px-3 sm:px-5 lg:px-8 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-950 dark:text-zinc-100 mb-2">
            마이페이지
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            계정 정보와 설정을 관리할 수 있습니다.
          </p>
        </div>

        {isSessionLoading && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">로그인 정보 확인 중…</p>
        )}
        {isRedirectingToLogin && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">로그인 페이지로 이동합니다…</p>
        )}
        {!accountReady && status === 'authenticated' && (isLoading || !user) && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">계정 정보 불러오는 중…</p>
        )}

        {user?.adminTrialEndsAt &&
          new Date(user.adminTrialEndsAt).getTime() > nowMs &&
          user.plan === 'FREE' && (
            <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/40">
              <FeedbackTrialActiveBanner
                endsAt={user.adminTrialEndsAt}
                headline="관리자 PRO 혜택 이용 중입니다."
                className="text-sm text-sky-900 dark:text-sky-100"
              />
            </div>
          )}

        {paymentFailure.isPastDue && hasPaidPlan && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  정기결제에 실패했습니다.
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                  카드 유효기간 만료·한도초과 등의 사유일 수 있습니다.
                  {paymentFailure.gracePeriodUntilLabel && (
                    <>
                      {' '}
                      <strong>{paymentFailure.gracePeriodUntilLabel}</strong>까지는 현재 플랜을
                      유지할 수 있습니다.
                    </>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/subscribe?plan=${subscribePlanParam}`
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
                  >
                    결제카드 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRetryPayment()}
                    disabled={isRetryingPayment}
                    className="px-4 py-2 rounded-lg border border-amber-400 text-amber-900 dark:text-amber-100 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-60"
                  >
                    {isRetryingPayment ? '결제 처리 중…' : '다시 결제하기'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  {accountEmail || '불러오는 중…'}
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                프로필에서 계정 정보를, 아래 결제 정보에서 구독·결제 내역을 확인할 수 있습니다.
              </div>

              <Link
                href="/order/fetch"
                className="block w-full mt-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition text-center"
              >
                즐겨찾는 쇼핑몰
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <LogOut className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                로그아웃
              </button>
            </div>
          </div>

          {/* 메인 컨텐츠 */}
          <div className="lg:col-span-3">
            <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                    프로필 정보
                  </h2>
                  
                  <div className="space-y-6">
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">닉네임 수정</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          닉네임 수정이 가능합니다.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="text"
                          value={nicknameInput}
                          onChange={(e) => setNicknameInput(e.target.value)}
                          maxLength={20}
                          placeholder="닉네임 입력"
                          className="flex-1 w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveNickname}
                          disabled={isSavingNickname}
                          className="sm:w-[120px] px-3 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isSavingNickname ? '저장 중...' : '닉네임 저장'}
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                        이메일
                      </label>
                      <input
                        type="email"
                        defaultValue={accountEmail}
                        disabled
                        className="w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 cursor-not-allowed"
                      />
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">휴대폰 번호 등록 (계정 보호)</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          선택사항입니다. 등록해두면 이메일 찾기/계정 복구에 도움이 됩니다.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(formatPhoneForInput(e.target.value))}
                          placeholder="010-1234-5678"
                          className="flex-1 w-full px-4 py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={handleSavePhone}
                          disabled={isSavingPhone}
                          className="sm:w-[120px] px-3 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isSavingPhone ? '저장 중...' : '번호 저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 사용량 */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                  <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                    사용량
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                    변환·다운로드 시 아래 잔여에서 차감됩니다.
                  </p>

                  <div className="rounded-xl border border-blue-200/80 dark:border-blue-800/60 overflow-hidden">
                    {accountReady ? (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-8 bg-blue-50 dark:bg-blue-950/30">
                          <div>
                            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                              잔여 사용량
                            </p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                              {getPlanName(user.plan)} 플랜 · 현재 이용 가능
                            </p>
                          </div>
                          <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-right">
                            {user.points.toLocaleString()}
                          </p>
                        </div>
                        <p className="px-6 py-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 border-t border-blue-200/60 dark:border-blue-800/40">
                          {getUsageHint(user.plan)}
                        </p>
                      </>
                    ) : (
                      <p className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        잔여 사용량 불러오는 중…
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 lg:p-8">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
                  결제 정보
                </h2>
                
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 shrink-0" aria-hidden />
                      <span>가입일: {joinDateLabel}</span>
                    </div>
                    <span className="hidden sm:inline text-zinc-300 dark:text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <span>
                      플랜:{' '}
                      {accountReady ? getPlanName(user.plan) : isLoadingSubscription ? '불러오는 중…' : '—'}
                    </span>
                  </div>

                  <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100">현재 플랜</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {accountReady
                            ? getPlanName(user.plan)
                            : isLoadingSubscription
                              ? '불러오는 중…'
                              : '—'}
                        </p>
                        {hasPaidPlan && currentPeriodEndText && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            다음 결제 예정일: {currentPeriodEndText}
                          </p>
                        )}
                        {pendingPlanChange && (
                          <p className="mt-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 leading-relaxed">
                            <strong>{pendingPlanChange.pendingPlanApplyAtLabel ?? '다음 결제일'}</strong>
                            부터{' '}
                            <strong>{pendingPlanChange.pendingPlanLabel}</strong> 플랜으로 변경
                            예정입니다. (현재 {pendingPlanChange.currentPlanLabel})
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          paymentFailure.isPastDue
                            ? 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                            : subscriptionState.cancelAtPeriodEnd
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                              : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {paymentFailure.isPastDue
                          ? '결제실패'
                          : subscriptionState.cancelAtPeriodEnd
                            ? '해지예약'
                            : '활성'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/subscribe?plan=${user?.plan === 'YEARLY' ? 'monthly' : 'yearly'}`
                          )
                        }
                        className="w-full px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
                      >
                        다른 주기 플랜으로 변경
                      </button>
                      {pendingPlanChange && (
                        <button
                          type="button"
                          onClick={handleCancelPlanChange}
                          disabled={isCancellingPlanChange}
                          className="w-full px-4 py-2 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {isCancellingPlanChange ? '취소 중…' : '플랜 변경 예약 취소'}
                        </button>
                      )}
                    </div>

                    {hasPaidPlan ? (
                      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {subscriptionState.cancelAtPeriodEnd
                            ? `해지 예약 상태 · 서비스 이용 종료일 ${currentPeriodEndText ?? '-'}`
                            : `정기결제 활성 · 다음 결제 예정일 ${currentPeriodEndText ?? '-'}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleSubscriptionToggle}
                            disabled={isUpdatingSubscription}
                            className={`px-6 py-3 rounded-lg transition-colors text-sm font-semibold ${
                              subscriptionState.cancelAtPeriodEnd
                                ? 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                : 'border border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                          >
                            {isUpdatingSubscription
                              ? '처리 중...'
                              : subscriptionState.cancelAtPeriodEnd
                                ? '해지 예약 취소'
                                : '정기결제 해지 예약'}
                          </button>
                          <button
                            type="button"
                            onClick={handleRefundRequest}
                            disabled={isRequestingRefund || refundState.hasPendingRefund}
                            className="px-6 py-3 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
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
                            ? `환불 신청이 접수되어 검토 중입니다${refundState.createdAt ? ` (${new Date(refundState.createdAt).toLocaleDateString('ko-KR')} 접수)` : ''}. 신청 시점에 잔여 사용량은 차감(보류) 처리됩니다.`
                            : '환불은 신청 접수 후 정책 기준에 따라 검토·처리되며, 신청 시점에 잔여 사용량은 차감(보류) 처리됩니다. 결과는 회신 이메일로 안내됩니다.'}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => setIsPaymentHistoryOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 text-left rounded-lg py-1 -mx-1 px-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        aria-expanded={isPaymentHistoryOpen}
                      >
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          결제 내역
                          {!isLoadingPaymentHistory && paymentHistory.length > 0 && (
                            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                              ({paymentHistory.length}건)
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                            isPaymentHistoryOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {isPaymentHistoryOpen && (
                        <div className="mt-3">
                          {isLoadingPaymentHistory ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
                          ) : paymentHistory.length === 0 ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              결제 내역이 없습니다.
                            </p>
                          ) : (
                            <>
                              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {paymentHistory.map((item) => (
                                  <li
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {item.planLabel}
                                      </p>
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        {item.paidAtLabel}
                                        {item.paymentProviderLabel !== '-' && (
                                          <> · {item.paymentProviderLabel}</>
                                        )}
                                      </p>
                                    </div>
                                    <p className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                                      {item.amount.toLocaleString()}
                                      {item.currency === 'KRW' ? '원' : ` ${item.currency}`}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                                최근 {paymentHistory.length}건 표시
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => setIsPointGrantHistoryOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 text-left rounded-lg py-1 -mx-1 px-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        aria-expanded={isPointGrantHistoryOpen}
                      >
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          포인트 지급 내역
                          {!isLoadingPointGrantHistory && pointGrantHistory.length > 0 && (
                            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                              ({pointGrantHistory.length}건)
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                            isPointGrantHistoryOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {isPointGrantHistoryOpen && (
                        <div className="mt-3">
                          {isLoadingPointGrantHistory ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
                          ) : pointGrantHistory.length === 0 ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              포인트 지급 내역이 없습니다.
                            </p>
                          ) : (
                            <>
                              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {pointGrantHistory.map((item) => (
                                  <li
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {item.reasonLabel}
                                      </p>
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        {item.grantedAtLabel}
                                      </p>
                                    </div>
                                    <p className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                                      +{item.change.toLocaleString()}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                                최근 {pointGrantHistory.length}건 표시
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => setIsPointUsageHistoryOpen((open) => !open)}
                        className="flex w-full items-center justify-between gap-2 text-left rounded-lg py-1 -mx-1 px-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        aria-expanded={isPointUsageHistoryOpen}
                      >
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          포인트 사용 내역
                          {!isLoadingPointUsageHistory && pointUsageHistory.length > 0 && (
                            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                              ({pointUsageHistory.length}건)
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                            isPointUsageHistoryOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </button>

                      {isPointUsageHistoryOpen && (
                        <div className="mt-3">
                          {isLoadingPointUsageHistory ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</p>
                          ) : pointUsageHistory.length === 0 ? (
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                              포인트 사용 내역이 없습니다.
                            </p>
                          ) : (
                            <>
                              <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                {pointUsageHistory.map((item) => (
                                  <li
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {item.reasonLabel}
                                      </p>
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        {item.usedAtLabel}
                                      </p>
                                    </div>
                                    <p className="shrink-0 font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
                                      -{item.change.toLocaleString()}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                                최근 {pointUsageHistory.length}건 표시
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">결제 수단</p>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      {tossCardState.hasBillingKey ? (
                        <div className="w-full max-w-[360px] rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-600 p-5 text-white shadow-lg">
                          <div className="mb-8 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-100">EXCLOAD</p>
                              <p className="mt-1 text-lg font-bold">
                                {tossCardState.cardCompany || '결제카드'}
                              </p>
                            </div>
                            <CreditCard className="h-7 w-7 text-blue-100" />
                          </div>
                          <p className="font-mono text-xl font-semibold tracking-[0.18em]">
                            {tossCardState.cardNumberMask || tossCardState.cardSummary || '등록된 카드'}
                          </p>
                          <p className="mt-4 text-xs text-blue-100">자동결제용 카드가 등록되어 있습니다.</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">등록된 결제카드 없음</p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              구독 페이지에서 카드 등록 후 결제를 진행해 주세요.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <button
                          type="button"
                          onClick={() => router.push(`/subscribe?plan=${subscribePlanParam}`)}
                          disabled={!accountReady}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                          {tossCardState.hasBillingKey ? '카드 변경' : '카드 등록'}
                        </button>
                        {tossCardState.hasBillingKey && (
                          <>
                            <button
                              type="button"
                              onClick={handleDeleteCard}
                              disabled={!accountReady || isDeletingCard}
                              className="text-sm text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                            >
                              {isDeletingCard ? '카드 삭제 중...' : '카드 삭제'}
                            </button>
                            <p className="max-w-[260px] text-left text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-right">
                              유료 플랜 이용 중에는 먼저 정기결제 해지 예약을 진행해 주세요.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-lg border border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20">
                    <div className="flex items-start gap-3">
                      <UserX className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">회원 탈퇴</p>
                        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                          <li>탈퇴 직후 로그인·서비스 이용이 중단됩니다. 진행 중인 구독은 해지됩니다.</li>
                          <li>
                            <strong>7일 유예:</strong> 기간 안에 로그인하거나 같은 이메일로 재가입하면 계정이
                            복구되고, 잔여 사용량·설정이 유지됩니다.
                          </li>
                          <li>7일이 지나면 계정·즐겨찾기·결제 기록 등이 영구 삭제되며, 이후 재가입 시 무료 가입
                            보너스·월간 무료 지급은 다시 제공되지 않을 수 있습니다.</li>
                          <li>환불 신청이 검토 중이면 탈퇴할 수 없습니다.</li>
                          <li>브라우저에 저장된 변환 내역 등은 기기에서 직접 삭제해 주세요.</li>
                        </ul>
                        <button
                          type="button"
                          onClick={() => void openWithdrawModal()}
                          className="rounded-lg border border-black bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-50 dark:border-black dark:bg-zinc-900 dark:text-black dark:hover:bg-zinc-800"
                        >
                          회원 탈퇴하기
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </main>
      {showRefundModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">환불 신청 작성</h3>
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
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">회원 탈퇴</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              탈퇴 직후 이용이 중단됩니다. 7일 안에 로그인·재가입으로 복구할 수 있으며, 잔여 사용량이
              유지됩니다. 7일이 지나면 데이터가 영구 삭제됩니다.
            </p>

            {withdrawRequiresPassword ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    type={showWithdrawPassword ? 'text' : 'password'}
                    value={withdrawPassword}
                    onChange={(e) => setWithdrawPassword(e.target.value)}
                    placeholder="현재 비밀번호"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-zinc-300 py-2 pl-3 pr-10 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWithdrawPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    aria-label={showWithdrawPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showWithdrawPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  확인 문구 입력
                </label>
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  아래 문구를 그대로 입력해 주세요: <strong>탈퇴합니다</strong>
                </p>
                <input
                  type="text"
                  value={withdrawConfirmText}
                  onChange={(e) => setWithdrawConfirmText(e.target.value)}
                  placeholder="탈퇴합니다"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                disabled={isDeletingAccount}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeletingAccount}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {isDeletingAccount ? '탈퇴 처리 중…' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
