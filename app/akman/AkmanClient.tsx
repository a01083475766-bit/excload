'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AkmanStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  yearlyUsers: number;
  todayUsers: number;
  newUsersSince: number | null;
  monthlyUsers: number;
  revenue: number;
  monthlyRevenue: number;
}

const AKMAN_LAST_SEEN_KEY = 'excload-akman-dashboard-last-seen';

interface DuplicateReportUser {
  id: string;
  email: string;
  phone?: string | null;
  signupProvider: string;
  lastLoginProvider: string;
  createdAt: string;
}

interface DuplicateReportGroup {
  normalizedEmail: string;
  count: number;
  users: DuplicateReportUser[];
}

interface DuplicateReportSummary {
  checkedAt: string;
  totalUsers: number;
  duplicateEmailGroupCount: number;
  duplicateUserCount: number;
  signupProviderCounts: Array<{ provider: string; count: number }>;
}

interface AdminUserRow {
  id: string;
  email: string;
  phone?: string | null;
  plan: 'FREE' | 'PRO' | 'YEARLY' | string;
  points: number;
  signupProvider?: 'CREDENTIALS' | 'GOOGLE' | 'KAKAO' | 'NAVER' | 'UNKNOWN' | string;
  lastLoginProvider?: 'CREDENTIALS' | 'GOOGLE' | 'KAKAO' | 'NAVER' | 'UNKNOWN' | string;
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

const menuCard: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '20px',
  display: 'block',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  cursor: 'pointer',
  position: 'relative',
};

const menuBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  minWidth: '20px',
  height: '20px',
  padding: '0 6px',
  borderRadius: '999px',
  background: '#dc2626',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  flexShrink: 0,
};

function formatBadgeCount(n: number): string {
  if (n > 99) return '99+';
  return String(n);
}

export default function AkmanClient() {
  const router = useRouter();
  const pathname = usePathname();
  const adminHome = pathname?.startsWith('/admin') ? '/admin' : '/akman';
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
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateSummary, setDuplicateSummary] = useState<DuplicateReportSummary | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateReportGroup[]>([]);
  const [menuBadges, setMenuBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lastSeen =
          typeof window !== 'undefined' ? localStorage.getItem(AKMAN_LAST_SEEN_KEY) : null;
        const statsUrl = lastSeen
          ? `/api/akman/stats?since=${encodeURIComponent(lastSeen)}`
          : '/api/akman/stats';
        const badgesUrl = lastSeen
          ? `/api/akman/dashboard-badges?since=${encodeURIComponent(lastSeen)}`
          : '/api/akman/dashboard-badges';

        const [statsRes, badgesRes] = await Promise.all([
          fetch(statsUrl),
          fetch(badgesUrl),
        ]);

        if (cancelled) return;

        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
          setStatsError(null);
          if (typeof window !== 'undefined') {
            localStorage.setItem(AKMAN_LAST_SEEN_KEY, new Date().toISOString());
          }
        } else if (statsRes.status === 401 || statsRes.status === 403) {
          setStats(null);
          setStatsError('요약 통계는 관리자 로그인 후에 표시됩니다. 아래 메뉴는 권한에 따라 일부만 동작할 수 있습니다.');
        } else {
          setStats(null);
          setStatsError('통계를 불러오지 못했습니다.');
        }

        if (badgesRes.ok) {
          const badgeData = await badgesRes.json();
          setMenuBadges(badgeData.badges ?? {});
        } else {
          setMenuBadges({});
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setStatsError('통계를 불러오지 못했습니다.');
          setMenuBadges({});
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
    router.push(`${adminHome}/users/${encodeURIComponent(id)}`);
  };

  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const fmtWon = (n: number) => `${fmt(n)}원`;

  const newSignupSinceLastVisit =
    stats?.newUsersSince != null && stats.newUsersSince > 0 ? stats.newUsersSince : 0;
  const newSignupToday = stats?.todayUsers ?? 0;
  const newSignupBadgeCount =
    newSignupSinceLastVisit > 0 ? newSignupSinceLastVisit : newSignupToday;
  const newSignupBadgeLabel =
    newSignupSinceLastVisit > 0 ? '마지막 방문 이후' : '오늘';

  const loadUsers = async (
    plan: 'ALL' | 'FREE' | 'PRO' | 'YEARLY' = userPlanFilter,
    date: 'ALL' | 'today' | 'thisMonth' = userDateFilter,
    search: string = userSearchTerm
  ) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (plan !== 'ALL') params.set('plan', plan);
      if (date !== 'ALL') params.set('date', date);
      const trimmed = search.trim();
      if (trimmed) params.set('search', trimmed);
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
    date: 'ALL' | 'today' | 'thisMonth' = 'ALL',
    search: string = userSearchTerm
  ) => {
    setUsersOpen(true);
    setUserPlanFilter(plan);
    setUserDateFilter(date);
    await loadUsers(plan, date, search);
  };

  const downloadMemberEmailsExcel = async () => {
    try {
      const res = await fetch('/api/akman/users/export-emails');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '이메일 목록 다운로드에 실패했습니다.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excload-member-emails-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : '이메일 목록 다운로드에 실패했습니다.');
    }
  };

  const downloadUsersExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (userPlanFilter !== 'ALL') params.set('plan', userPlanFilter);
      if (userDateFilter !== 'ALL') params.set('date', userDateFilter);
      if (userSearchTerm.trim()) params.set('search', userSearchTerm.trim());
      const res = await fetch(`/api/akman/users/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || '엑셀 다운로드에 실패했습니다.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excload-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : '엑셀 다운로드에 실패했습니다.');
    }
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

  const loadDuplicateReport = async () => {
    setDuplicateLoading(true);
    setDuplicateError(null);
    try {
      const res = await fetch('/api/akman/users/duplicate-report');
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '중복 계정 리포트를 불러오지 못했습니다.');
      }
      setDuplicateSummary(data.summary ?? null);
      setDuplicateGroups(data.groups ?? []);
    } catch (error) {
      setDuplicateSummary(null);
      setDuplicateGroups([]);
      setDuplicateError(error instanceof Error ? error.message : '중복 계정 리포트를 불러오지 못했습니다.');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const menuItems: { href: string; title: string; desc: string }[] = [
    { href: '/akman/payments', title: '결제 내역', desc: '결제·플랜 기록 조회' },
    { href: '/akman/contact-inquiries', title: '고객문의', desc: '문의 접수·답변 상태 관리' },
    { href: '/akman/refunds', title: '환불 신청', desc: '환불 접수/승인/반려 관리' },
    { href: '/akman/points', title: '사용량 로그', desc: '사용량 제공·차감 이력' },
    { href: '/akman/ai-mapping', title: 'AI 매핑', desc: '매핑 규칙 관리' },
    { href: '/akman/template-header-logs', title: '헤더 수집 로그', desc: '주문·양식 1행 헤더 수집' },
    { href: '/akman/header-dictionary', title: '헤더 사전', desc: '신규 헤더·사용 횟수' },
    { href: '/akman/popups', title: '팝업 관리', desc: '사이트 팝업 설정' },
    { href: '/admin/feedback-event', title: '피드백 이벤트', desc: '기간·접수·체험권' },
    { href: '/akman/favorite-malls', title: '즐겨찾기 URL', desc: '자주 등록된 쇼핑몰 주소 집계' },
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
      {!statsLoading && stats && (newSignupSinceLastVisit > 0 || newSignupToday > 0) && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid #86efac',
            background: '#ecfdf5',
            color: '#065f46',
            fontSize: '14px',
            lineHeight: 1.5,
          }}
        >
          {newSignupSinceLastVisit > 0 && (
            <div style={{ fontWeight: 600 }}>
              마지막 방문 이후 신규 가입 {fmt(newSignupSinceLastVisit)}명
            </div>
          )}
          {newSignupToday > 0 && (
            <div style={{ fontWeight: newSignupSinceLastVisit > 0 ? 500 : 600, marginTop: newSignupSinceLastVisit > 0 ? 4 : 0 }}>
              오늘 신규 가입 {fmt(newSignupToday)}명
            </div>
          )}
        </div>
      )}
      {!statsLoading && stats && (
        <div style={cardGrid}>
          <div style={{ ...statCard, cursor: 'pointer' }} onClick={() => openUsers('ALL', 'ALL')}>
            <div style={{ fontSize: '13px', color: '#666' }}>전체 회원</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.totalUsers)}</div>
          </div>
          <div
            style={{
              ...statCard,
              cursor: 'pointer',
              ...(newSignupToday > 0
                ? { border: '1px solid #86efac', background: '#ecfdf5' }
                : {}),
            }}
            onClick={() => openUsers('ALL', 'today')}
          >
            <div style={{ fontSize: '13px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
              오늘 가입
              {newSignupToday > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: '#16a34a',
                    color: '#fff',
                  }}
                >
                  +{fmt(newSignupToday)}
                </span>
              )}
            </div>
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

      <div
        style={{
          border: '1px solid #cfe8ff',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
          background: '#f0f7ff',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>회원 이메일 목록 (관리자 전용)</div>
        <p style={{ fontSize: '14px', color: '#555', marginBottom: '12px', lineHeight: 1.5 }}>
          전체 회원 이메일·이름·플랜을 엑셀로 받을 수 있습니다. 사이트 내 일괄 발송 기능은 없으며,
          다운로드한 목록으로 별도 메일 도구에서 안내하시면 됩니다.
        </p>
        <button
          type="button"
          onClick={() => void downloadMemberEmailsExcel()}
          style={{
            padding: '10px 16px',
            border: '1px solid #175cd3',
            background: '#175cd3',
            color: '#fff',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          회원 이메일 엑셀 다운로드
        </button>
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>바로가기</h2>
      <div style={cardGrid}>
        {menuItems.map((item) => {
          const badgeCount = menuBadges[item.href] ?? 0;
          return (
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
            style={{
              ...menuCard,
              textDecoration: 'none',
              color: 'inherit',
              ...(badgeCount > 0 ? { borderColor: '#fca5a5', background: '#fffbfb' } : {}),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
              <div style={linkStyle}>{item.title}</div>
              {badgeCount > 0 && (
                <span style={menuBadgeStyle} title="확인할 항목">
                  {formatBadgeCount(badgeCount)}
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>{item.desc}</div>
          </div>
          );
        })}
      </div>

      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '20px',
          marginTop: '8px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>가입 회원 목록</span>
          {newSignupBadgeCount > 0 && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '999px',
                background: '#dc2626',
                color: '#fff',
              }}
            >
              {newSignupBadgeLabel} 신규 {fmt(newSignupBadgeCount)}명
            </span>
          )}
        </div>
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
            {!usersOpen && newSignupBadgeCount > 0 ? ` (${fmt(newSignupBadgeCount)}명)` : ''}
          </button>
          {usersOpen && (
            <>
              <button type="button" onClick={() => void openUsers('ALL', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>전체</button>
              <button type="button" onClick={() => void openUsers('FREE', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>FREE</button>
              <button type="button" onClick={() => void openUsers('PRO', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>PRO</button>
              <button type="button" onClick={() => void openUsers('YEARLY', 'ALL')} style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}>YEARLY</button>
              <button
                type="button"
                onClick={downloadUsersExcel}
                style={{ padding: '8px 12px', border: '1px solid #0a7', background: '#e8fff8', color: '#065f46', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                회원 엑셀 다운로드
              </button>
            </>
          )}
        </div>
        {usersOpen && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void openUsers(userPlanFilter, userDateFilter, userSearchTerm);
                }
              }}
              placeholder="이메일 또는 전화번호 검색"
              style={{
                flex: '1 1 240px',
                padding: '8px 10px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
            <button
              type="button"
              onClick={() => void openUsers(userPlanFilter, userDateFilter, userSearchTerm)}
              style={{ padding: '8px 12px', border: '1px solid #ccc', background: '#fff', borderRadius: '6px', cursor: 'pointer' }}
            >
              검색
            </button>
          </div>
        )}
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
                    onClick={() => router.push(`${adminHome}/users/${encodeURIComponent(u.id)}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.8fr 1fr 90px 90px 90px 110px 110px 90px',
                      gap: '8px',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.phone || '-'}</div>
                    <div>{u.plan}</div>
                    <div>{providerLabel(u.signupProvider)}</div>
                    <div>{providerLabel(u.lastLoginProvider)}</div>
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

        <div style={{ fontWeight: 600, marginBottom: '10px' }}>사용자 상세 (ID · 이메일 · 전화번호)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goUser()}
            placeholder="cuid, 이메일, 또는 전화번호"
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

      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '20px',
          marginTop: '12px',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>중복 계정 점검 리포트</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void loadDuplicateReport()}
            disabled={duplicateLoading}
            style={{
              padding: '8px 12px',
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: '6px',
              cursor: duplicateLoading ? 'not-allowed' : 'pointer',
              opacity: duplicateLoading ? 0.7 : 1,
            }}
          >
            {duplicateLoading ? '점검 중...' : '중복 계정 점검 실행'}
          </button>
        </div>
        {duplicateError && <div style={{ color: '#b42318', marginBottom: '8px' }}>{duplicateError}</div>}
        {duplicateSummary && (
          <div style={{ marginBottom: '12px', fontSize: '13px', color: '#333' }}>
            전체 회원 {fmt(duplicateSummary.totalUsers)}명 / 대소문자 무시 이메일 중복 그룹 {fmt(duplicateSummary.duplicateEmailGroupCount)}건 / 중복 의심 계정 {fmt(duplicateSummary.duplicateUserCount)}명
            <div style={{ color: '#666', marginTop: '4px' }}>
              점검 시각: {new Date(duplicateSummary.checkedAt).toLocaleString('ko-KR')}
            </div>
          </div>
        )}
        {duplicateSummary && (
          <div style={{ marginBottom: '12px', fontSize: '13px', color: '#333' }}>
            가입경로 분포:{' '}
            {duplicateSummary.signupProviderCounts
              .map((row) => `${providerLabel(row.provider)} ${fmt(row.count)}명`)
              .join(' / ')}
          </div>
        )}
        {duplicateSummary && duplicateGroups.length === 0 && (
          <div style={{ color: '#0a7f2e', fontSize: '13px' }}>
            중복 의심 계정이 없습니다. (대소문자 무시 이메일 기준)
          </div>
        )}
        {duplicateGroups.length > 0 && (
          <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
            {duplicateGroups.map((group) => (
              <div key={group.normalizedEmail} style={{ borderBottom: '1px solid #f2f2f2', padding: '10px 12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  {group.normalizedEmail} ({fmt(group.count)}건)
                </div>
                {group.users.map((u) => (
                  <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 90px 90px 110px', gap: '8px', fontSize: '12px', marginBottom: '4px' }}>
                    <div>{u.email}</div>
                    <div>{u.phone || '-'}</div>
                    <div>{providerLabel(u.signupProvider)}</div>
                    <div>{providerLabel(u.lastLoginProvider)}</div>
                    <div>{new Date(u.createdAt).toLocaleDateString('ko-KR')}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
