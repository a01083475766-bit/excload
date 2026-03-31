'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AkmanStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  yearlyUsers: number;
  todayUsers: number;
  monthlyUsers: number;
  revenue: number;
  monthlyRevenue: number;
}

interface AdminUserRow {
  id: string;
  email: string;
  plan: 'FREE' | 'PRO' | 'YEARLY' | string;
  points: number;
  createdAt: string;
}

const shell: React.CSSProperties = {
  padding: '40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '960px',
};

const linkStyle: React.CSSProperties = {
  color: '#0066cc',
  textDecoration: 'none',
  fontSize: '16px',
  fontWeight: 500,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '16px',
  marginTop: '24px',
  marginBottom: '32px',
};

const statCard: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  padding: '16px',
  background: '#fafafa',
};

const menuCard: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '20px',
  display: 'block',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  cursor: 'pointer',
};

export default function AkmanClient() {
  const router = useRouter();
  const [stats, setStats] = useState<AkmanStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [userIdInput, setUserIdInput] = useState('');
  const [usersOpen, setUsersOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userPlanFilter, setUserPlanFilter] = useState<'ALL' | 'FREE' | 'PRO' | 'YEARLY'>('ALL');
  const [userDateFilter, setUserDateFilter] = useState<'ALL' | 'today' | 'thisMonth'>('ALL');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/akman/stats');
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setStats(data);
          setStatsError(null);
        } else if (res.status === 401 || res.status === 403) {
          setStats(null);
          setStatsError('요약 통계는 관리자 로그인 후에 표시됩니다. 아래 메뉴는 권한에 따라 일부만 동작할 수 있습니다.');
        } else {
          setStats(null);
          setStatsError('통계를 불러오지 못했습니다.');
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setStatsError('통계를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goUser = () => {
    const id = userIdInput.trim();
    if (!id) return;
    router.push(`/akman/users/${encodeURIComponent(id)}`);
  };

  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const fmtWon = (n: number) => `${fmt(n)}원`;

  const loadUsers = async (
    plan: 'ALL' | 'FREE' | 'PRO' | 'YEARLY' = userPlanFilter,
    date: 'ALL' | 'today' | 'thisMonth' = userDateFilter
  ) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (plan !== 'ALL') params.set('plan', plan);
      if (date !== 'ALL') params.set('date', date);
      const res = await fetch(`/api/akman/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '회원 목록을 불러오지 못했습니다.');
      }
      setUsers(data.users || []);
    } catch (error) {
      setUsers([]);
      setUsersError(error instanceof Error ? error.message : '회원 목록을 불러오지 못했습니다.');
    } finally {
      setUsersLoading(false);
    }
  };

  const openUsers = async (
    plan: 'ALL' | 'FREE' | 'PRO' | 'YEARLY' = 'ALL',
    date: 'ALL' | 'today' | 'thisMonth' = 'ALL'
  ) => {
    setUsersOpen(true);
    setUserPlanFilter(plan);
    setUserDateFilter(date);
    await loadUsers(plan, date);
  };

  const deleteUserFromList = async (user: AdminUserRow) => {
    if (deletingUserId) return;
    const ok = window.confirm(`정말로 ${user.email} 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
    if (!ok) return;

    setDeletingUserId(user.id);
    try {
      const res = await fetch('/api/akman/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '사용자 삭제에 실패했습니다.');
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      alert(typeof data.message === 'string' ? data.message : '사용자가 삭제되었습니다.');
      // 통계 카드 숫자도 맞춰지도록 재조회
      await loadUsers(userPlanFilter, userDateFilter);
    } catch (error) {
      alert(error instanceof Error ? error.message : '사용자 삭제에 실패했습니다.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const menuItems: { href: string; title: string; desc: string }[] = [
    { href: '/akman/payments', title: '결제 내역', desc: '결제·플랜 기록 조회' },
    { href: '/akman/refunds', title: '환불 신청', desc: '환불 접수/승인/반려 관리' },
    { href: '/akman/points', title: '사용량 로그', desc: '사용량 제공·차감 이력' },
    { href: '/akman/ai-mapping', title: 'AI 매핑', desc: '매핑 규칙 관리' },
    { href: '/akman/popups', title: '팝업 관리', desc: '사이트 팝업 설정' },
    { href: '/akman/abuse', title: '어뷰징', desc: '의심 계정·조치' },
  ];

  return (
    <div style={shell}>
      <h1 style={{ marginBottom: '8px', fontSize: '1.5rem' }}>관리자 대시보드</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        운영 메뉴로 이동하거나, 사용자 ID로 상세 페이지를 열 수 있습니다.
      </p>

      {statsLoading && <p style={{ color: '#666' }}>통계 불러오는 중…</p>}
      {!statsLoading && statsError && (
        <p style={{ color: '#856404', background: '#fff3cd', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
          {statsError}
        </p>
      )}
      {!statsLoading && stats && (
        <div style={cardGrid}>
          <div style={{ ...statCard, cursor: 'pointer' }} onClick={() => openUsers('ALL', 'ALL')}>
            <div style={{ fontSize: '13px', color: '#666' }}>전체 회원</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.totalUsers)}</div>
          </div>
          <div style={{ ...statCard, cursor: 'pointer' }} onClick={() => openUsers('ALL', 'today')}>
            <div style={{ fontSize: '13px', color: '#666' }}>오늘 가입</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.todayUsers)}</div>
          </div>
          <div style={{ ...statCard, cursor: 'pointer' }} onClick={() => openUsers('ALL', 'thisMonth')}>
            <div style={{ fontSize: '13px', color: '#666' }}>이번 달 가입</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.monthlyUsers)}</div>
          </div>
          <div style={{ ...statCard, cursor: 'pointer' }} onClick={() => openUsers('FREE', 'ALL')}>
            <div style={{ fontSize: '13px', color: '#666' }}>FREE / PRO / YEARLY</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '4px' }}>
              {fmt(stats.freeUsers)} / {fmt(stats.proUsers)} / {fmt(stats.yearlyUsers)}
            </div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '13px', color: '#666' }}>누적 매출</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmtWon(stats.revenue)}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '13px', color: '#666' }}>이번 달 매출</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmtWon(stats.monthlyRevenue)}</div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>바로가기</h2>
      <div style={cardGrid}>
        {menuItems.map((item) => (
          <div
            key={item.href}
            role="link"
            tabIndex={0}
            onClick={() => router.push(item.href)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(item.href);
              }
            }}
            style={{ ...menuCard, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ ...linkStyle, marginBottom: '6px' }}>{item.title}</div>
            <div style={{ fontSize: '14px', color: '#666' }}>{item.desc}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '20px',
          marginTop: '8px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>가입 회원 목록</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            type="button"
            onClick={() => {
              if (usersOpen) {
                setUsersOpen(false);
              } else {
                void openUsers(userPlanFilter, userDateFilter);
              }
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {usersOpen ? '회원 목록 닫기' : '회원 목록 펼치기'}
          </button>
          {usersOpen && (
            <>
              <button type="button" onClick={() => void openUsers('ALL', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>전체</button>
              <button type="button" onClick={() => void openUsers('FREE', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>FREE</button>
              <button type="button" onClick={() => void openUsers('PRO', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>PRO</button>
              <button type="button" onClick={() => void openUsers('YEARLY', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>YEARLY</button>
            </>
          )}
        </div>
        {usersOpen && (
          <div style={{ marginBottom: '16px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
            {usersLoading && <div style={{ padding: '12px', color: '#666' }}>회원 목록 불러오는 중...</div>}
            {!usersLoading && usersError && <div style={{ padding: '12px', color: '#b42318' }}>{usersError}</div>}
            {!usersLoading && !usersError && users.length === 0 && <div style={{ padding: '12px', color: '#666' }}>조회된 회원이 없습니다.</div>}
            {!usersLoading && !usersError && users.length > 0 && (
              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                {users.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => router.push(`/akman/users/${encodeURIComponent(u.id)}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 90px 110px 110px 90px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                    <div>{u.plan}</div>
                    <div>{fmt(u.points)}</div>
                    <div>{new Date(u.createdAt).toLocaleDateString('ko-KR')}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteUserFromList(u);
                      }}
                      disabled={deletingUserId === u.id}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #ef4444',
                        color: '#b91c1c',
                        background: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: deletingUserId === u.id ? 'not-allowed' : 'pointer',
                        opacity: deletingUserId === u.id ? 0.6 : 1,
                      }}
                    >
                      {deletingUserId === u.id ? '삭제 중' : '삭제'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ fontWeight: 600, marginBottom: '10px' }}>사용자 상세 (ID)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goUser()}
            placeholder="사용자 ID (cuid)"
            style={{
              flex: '1 1 220px',
              padding: '10px 12px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '15px',
            }}
          />
          <button
            type="button"
            onClick={goUser}
            style={{
              padding: '10px 18px',
              background: '#0066cc',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            이동
          </button>
        </div>
      </div>
    </div>
  );
}
