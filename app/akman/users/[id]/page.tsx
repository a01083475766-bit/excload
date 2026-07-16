/**
 * EXCLOAD 관리자 사용자 상세 페이지
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안 규칙:
 * 1. 로그인된 사용자만 접근 가능
 * 2. session.user.email === process.env.ADMIN_EMAIL 인 경우만 접근 허용
 * 3. 관리자 이메일이 아니면 "/" 로 redirect
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';

interface PointHistory {
  id: string;
  change: number;
  reason: string;
  createdAt: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  plan: string;
  createdAt: string;
}

interface UserDetail {
  id: string;
  email: string;
  phone?: string | null;
  plan: string;
  points: number;
  adminTrialEndsAt?: string | null;
  signupProvider?: string | null;
  lastLoginProvider?: string | null;
  emailVerified: boolean | null;
  createdAt: string;
  pointHistory: PointHistory[];
  payments: Payment[];
}

const providerLabel = (provider?: string | null) => {
  switch (provider) {
    case 'CREDENTIALS':
      return '기본(이메일)';
    case 'GOOGLE':
      return 'Google';
    case 'KAKAO':
      return 'Kakao';
    case 'NAVER':
      return 'Naver';
    default:
      return '-';
  }
};

export default function UserDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const adminHome = pathname?.startsWith('/admin') ? '/admin' : '/akman';
  const params = useParams();
  const userId = typeof params?.id === 'string' ? params.id : '';
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialMonths, setTrialMonths] = useState(1);
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  // 렌더 중 Date.now() 직접 호출(impure)을 피하기 위해 마운트 후 현재 시각을 상태로 보관한다.
  const [nowMs, setNowMs] = useState<number | null>(null);

  // 사용자 상세 정보 조회
  const fetchUserDetail = async () => {
    try {
      const response = await fetch(`/api/akman/users/${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      } else if (response.status === 404) {
        alert('사용자를 찾을 수 없습니다.');
        router.push(adminHome);
      }
    } catch (error) {
      console.error('[User Detail Page] 사용자 조회 실패:', error);
      alert('사용자 정보를 불러오는데 실패했습니다.');
      router.push(adminHome);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDetail();
    }
  }, [userId, router]);

  // 관리자 PRO 체험 만료 판정용 기준 시각(클라이언트 마운트 시점).
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  // 사용량 증감
  const handleAdjustPoints = async (amount: number) => {
    if (!user) return;

    try {
      const response = await fetch('/api/akman/update-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, amount }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        fetchUserDetail();
      } else {
        alert(data.error || '사용량 조정에 실패했습니다.');
      }
    } catch (error) {
      console.error('[User Detail Page] 사용량 조정 실패:', error);
      alert('사용량 조정 중 오류가 발생했습니다.');
    }
  };

  // 관리자 PRO 혜택(N개월) 부여 — plan=FREE 유지, 포인트 변경 없음
  const handleGrantProTrial = async () => {
    if (!user) return;

    const months = Math.floor(Number(trialMonths));
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      alert('개월 수는 1~24 사이의 정수를 입력해 주세요.');
      return;
    }

    if (!confirm(`${user.email} 회원에게 PRO 혜택 ${months}개월을 부여하시겠습니까?\n(포인트는 변경되지 않습니다.)`)) {
      return;
    }

    setTrialSubmitting(true);
    try {
      const response = await fetch('/api/akman/grant-pro-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, months }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || 'PRO 혜택이 적용되었습니다.');
        fetchUserDetail();
      } else {
        alert(data.error || 'PRO 혜택 부여에 실패했습니다.');
      }
    } catch (error) {
      console.error('[User Detail Page] PRO 혜택 부여 실패:', error);
      alert('PRO 혜택 부여 중 오류가 발생했습니다.');
    } finally {
      setTrialSubmitting(false);
    }
  };

  const handleRevokeProTrial = async () => {
    if (!user) return;

    if (!confirm(`${user.email} 회원의 관리자 PRO 혜택을 즉시 취소하시겠습니까?`)) {
      return;
    }

    setTrialSubmitting(true);
    try {
      const response = await fetch('/api/akman/revoke-pro-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || 'PRO 혜택이 취소되었습니다.');
        fetchUserDetail();
      } else {
        alert(data.error || 'PRO 혜택 취소에 실패했습니다.');
      }
    } catch (error) {
      console.error('[User Detail Page] PRO 혜택 취소 실패:', error);
      alert('PRO 혜택 취소 중 오류가 발생했습니다.');
    } finally {
      setTrialSubmitting(false);
    }
  };

  // 플랜 변경 (유료 플랜 수동 조정용)
  const handleUpdatePlan = async () => {
    if (!user) return;

    let newPlan: 'FREE' | 'PRO' | 'YEARLY';
    if (user.plan === 'PRO') {
      newPlan = 'YEARLY';
    } else if (user.plan === 'YEARLY') {
      newPlan = 'FREE';
    } else {
      alert('FREE 회원 PRO 혜택은 아래 「PRO +N개월」로 부여해 주세요.');
      return;
    }

    if (!confirm(`플랜을 ${user.plan}에서 ${newPlan}로 변경하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/akman/update-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id, plan: newPlan }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || '플랜이 변경되었습니다.');
        fetchUserDetail();
      } else {
        alert(data.error || '플랜 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('[User Detail Page] 플랜 변경 실패:', error);
      alert('플랜 변경 중 오류가 발생했습니다.');
    }
  };

  // 계정 삭제
  const handleDeleteUser = async () => {
    if (!user) return;

    if (!confirm(`정말로 ${user.email} 사용자를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    try {
      const response = await fetch('/api/akman/delete-user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || '사용자가 삭제되었습니다.');
        router.push(adminHome);
      } else {
        alert(data.error || '사용자 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('[User Detail Page] 사용자 삭제 실패:', error);
      alert('사용자 삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p>사용자를 찾을 수 없습니다.</p>
        <Link href={adminHome} style={{ color: '#0066cc', textDecoration: 'none' }}>
          관리자 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href={adminHome}
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          ← 관리자 페이지로 돌아가기
        </Link>
      </div>

      <h1 style={{ marginBottom: '30px' }}>사용자 상세 정보</h1>

      {/* User Info 카드 */}
      <div
        style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '30px',
        }}
      >
        <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>User Info</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Email</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{user.email}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Phone</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{user.phone || '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Plan</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{user.plan}</div>
          </div>
          {user.adminTrialEndsAt &&
            nowMs !== null &&
            new Date(user.adminTrialEndsAt).getTime() > nowMs && (
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>관리자 PRO 혜택</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#17a2b8' }}>
                {new Date(user.adminTrialEndsAt).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })}{' '}
                까지
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Usage</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0066cc' }}>
              {user.points.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>이메일 인증</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {user.emailVerified ? (
                <span style={{ color: 'green' }}>✓ 인증완료</span>
              ) : (
                <span style={{ color: 'red' }}>✗ 미인증</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>가입일</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {new Date(user.createdAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>가입 경로</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{providerLabel(user.signupProvider)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>최근 로그인 경로</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{providerLabel(user.lastLoginProvider)}</div>
          </div>
        </div>
      </div>

      {/* 관리자 액션 버튼 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>관리자 액션</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleAdjustPoints(1000)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            +1000
          </button>
          <button
            onClick={() => handleAdjustPoints(2000)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            +2000
          </button>
          <button
            onClick={() => handleAdjustPoints(10000)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            +10000
          </button>
          <button
            onClick={() => handleAdjustPoints(400000)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            +400000
          </button>
          <button
            onClick={() => handleAdjustPoints(-1000)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            -1000
          </button>
          {user.plan === 'FREE' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '8px 12px',
                backgroundColor: '#e8f4f8',
                borderRadius: '6px',
                border: '1px solid #b8dce8',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#0c5460' }}>
                PRO 혜택
              </span>
              <select
                value={trialMonths}
                onChange={(e) => setTrialMonths(Number(e.target.value))}
                disabled={trialSubmitting}
                style={{
                  padding: '8px 10px',
                  fontSize: '14px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  minWidth: '88px',
                }}
                aria-label="PRO 혜택 개월 수"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}개월
                  </option>
                ))}
              </select>
              <button
                onClick={handleGrantProTrial}
                disabled={trialSubmitting}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: trialSubmitting ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: trialSubmitting ? 0.7 : 1,
                }}
              >
                +{trialMonths}개월 부여
              </button>
              {user.adminTrialEndsAt &&
                nowMs !== null &&
                new Date(user.adminTrialEndsAt).getTime() > nowMs && (
                  <button
                    onClick={handleRevokeProTrial}
                    disabled={trialSubmitting}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      backgroundColor: '#6f42c1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: trialSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    PRO 혜택 취소
                  </button>
                )}
              <span style={{ fontSize: '12px', color: '#666', width: '100%' }}>
                목록에서 개월 수를 고른 뒤 한 번만 누르면 해당 개월만큼 부여·연장됩니다.
              </span>
            </div>
          )}
          {(user.plan === 'PRO' || user.plan === 'YEARLY') && (
            <button
              onClick={handleUpdatePlan}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {user.plan === 'PRO' ? 'PRO → YEARLY' : 'YEARLY → FREE'}
            </button>
          )}
          <button
            onClick={handleDeleteUser}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            계정 삭제
          </button>
        </div>
      </div>

      {/* Point History 테이블 */}
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ marginBottom: '8px', fontSize: '20px' }}>Usage History</h2>
        <p style={{ marginBottom: '16px', fontSize: '13px', color: '#666' }}>
          지급·결제·다운로드·텍스트 변환 등 이 계정의 전체 사용량 이력입니다.
        </p>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            border: '1px solid #ccc',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>변화량</th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>이유</th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>일시</th>
            </tr>
          </thead>
          <tbody>
            {user.pointHistory.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #ccc',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  사용량 내역이 없습니다.
                </td>
              </tr>
            ) : (
              user.pointHistory.map((history) => (
                <tr key={history.id}>
                  <td
                    style={{
                      border: '1px solid #ccc',
                      padding: '12px',
                      textAlign: 'right',
                      color: history.change >= 0 ? 'green' : 'red',
                      fontWeight: 'bold',
                    }}
                  >
                    {history.change >= 0 ? '+' : ''}
                    {history.change.toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>{history.reason}</td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                    {new Date(history.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment History 테이블 */}
      <div>
        <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>Payment History</h2>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            border: '1px solid #ccc',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>플랜</th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>금액</th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>통화</th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>결제일</th>
            </tr>
          </thead>
          <tbody>
            {user.payments.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    border: '1px solid #ccc',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  결제 내역이 없습니다.
                </td>
              </tr>
            ) : (
              user.payments.map((payment) => (
                <tr key={payment.id}>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.plan}</td>
                  <td
                    style={{
                      border: '1px solid #ccc',
                      padding: '12px',
                      textAlign: 'right',
                      fontWeight: 'bold',
                    }}
                  >
                    ₩{payment.amount.toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>{payment.currency}</td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                    {new Date(payment.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
