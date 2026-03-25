'use client';

import Link from 'next/link';
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
};

export default function AkmanClient() {
  const router = useRouter();
  const [stats, setStats] = useState<AkmanStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [userIdInput, setUserIdInput] = useState('');

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

  const menuItems: { href: string; title: string; desc: string }[] = [
    { href: '/akman/payments', title: '결제 내역', desc: '결제·플랜 기록 조회' },
    { href: '/akman/points', title: '포인트 로그', desc: '포인트 지급·차감 이력' },
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
          <div style={statCard}>
            <div style={{ fontSize: '13px', color: '#666' }}>전체 회원</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.totalUsers)}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '13px', color: '#666' }}>오늘 가입</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.todayUsers)}</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '13px', color: '#666' }}>이번 달 가입</div>
            <div style={{ fontSize: '22px', fontWeight: 600 }}>{fmt(stats.monthlyUsers)}</div>
          </div>
          <div style={statCard}>
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
          <Link key={item.href} href={item.href} style={{ ...menuCard, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ ...linkStyle, marginBottom: '6px' }}>{item.title}</div>
            <div style={{ fontSize: '14px', color: '#666' }}>{item.desc}</div>
          </Link>
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
