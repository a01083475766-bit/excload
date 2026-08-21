'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Campaign = {
  id: string;
  providerCode: string;
  campaignCode: string;
  slug: string;
  status: string;
  title: string | null;
  redeemFrom: string | null;
  redeemUntil: string | null;
  stats?: { issued: number; redeemed: number; cancelled: number };
  rewardPolicies: Array<{
    id: string;
    rewardCode: string;
    durationMonths: number;
    soldPriceKrw: number | null;
    status: string;
  }>;
  _count: { vouchers: number };
};

const shell: React.CSSProperties = {
  padding: '24px 40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '1100px',
};

export default function AkmanVoucherCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setError('');
    const res = await fetch('/api/akman/vouchers/campaigns');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '불러오기 실패');
      return;
    }
    setCampaigns(data.campaigns || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return campaigns;
    return campaigns.filter(
      (c) =>
        c.campaignCode.toLowerCase().includes(s) ||
        c.slug.toLowerCase().includes(s) ||
        c.providerCode.toLowerCase().includes(s),
    );
  }, [campaigns, q]);

  const archive = async (id: string, status: string) => {
    if (!confirm(`상태를 ${status}로 변경할까요? (물리 삭제 없음)`)) return;
    const res = await fetch(`/api/akman/vouchers/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || '실패');
      return;
    }
    void load();
  };

  return (
    <div style={shell}>
      <p style={{ marginBottom: 12 }}>
        <Link href="/akman">← 관리자</Link>
        {' · '}
        <Link href="/akman/vouchers">이용권 목록</Link>
        {' · '}
        <Link href="/akman/vouchers/imports">CSV 발급</Link>
      </p>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>이용권 캠페인</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        판매 한도(30/30/30/150)는 참고용입니다. CSV 확정 구매가 발급 기준입니다.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="provider / campaignCode / slug 검색"
        style={{ height: 32, width: 320, padding: '0 8px', marginBottom: 16 }}
      />
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: 8 }}>캠페인</th>
            <th>리워드</th>
            <th>발급/등록/취소</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8, verticalAlign: 'top' }}>
                <div style={{ fontWeight: 600 }}>
                  {c.providerCode} / {c.campaignCode}
                </div>
                <div style={{ color: '#666' }}>
                  slug: {c.slug}
                  {c.title ? ` · ${c.title}` : ''}
                </div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  redeemFrom: {c.redeemFrom ? new Date(c.redeemFrom).toLocaleString('ko-KR') : '—'}
                </div>
              </td>
              <td style={{ verticalAlign: 'top', padding: 8 }}>
                {c.rewardPolicies.map((r) => (
                  <div key={r.id}>
                    {r.rewardCode} · {r.durationMonths}개월
                    {r.soldPriceKrw != null ? ` · ${r.soldPriceKrw.toLocaleString()}원` : ''}
                    {r.status !== 'ACTIVE' ? ` (${r.status})` : ''}
                  </div>
                ))}
              </td>
              <td style={{ verticalAlign: 'top', padding: 8 }}>
                {c.stats
                  ? `${c.stats.issued} / ${c.stats.redeemed} / ${c.stats.cancelled}`
                  : c._count.vouchers}
              </td>
              <td style={{ verticalAlign: 'top', padding: 8 }}>{c.status}</td>
              <td style={{ verticalAlign: 'top', padding: 8 }}>
                {c.status !== 'ARCHIVED' && (
                  <button type="button" onClick={() => void archive(c.id, 'ARCHIVED')}>
                    ARCHIVED
                  </button>
                )}
                {c.status === 'ARCHIVED' && (
                  <button type="button" onClick={() => void archive(c.id, 'ACTIVE')}>
                    ACTIVE
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
