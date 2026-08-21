'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const shell: React.CSSProperties = {
  padding: '24px 40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '1200px',
};

type Row = {
  id: string;
  status: string;
  codeLast4: string;
  codeVersion: number;
  externalOrderId: string;
  unitIndex: number;
  purchaseAmount: number | null;
  campaignCode: string;
  providerCode: string;
  rewardCode: string;
  redeemedBy: { id: string; email: string } | null;
  entitlement: {
    id: string;
    lifecycleStatus: string;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
};

export default function AkmanVouchersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [campaignId, setCampaignId] = useState('');
  const [status, setStatus] = useState('');
  const [externalOrderId, setExternalOrderId] = useState('');
  const [codeLast4, setCodeLast4] = useState('');
  const [email, setEmail] = useState('');
  const [campaigns, setCampaigns] = useState<Array<{ id: string; campaignCode: string }>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/akman/vouchers/campaigns')
      .then((r) => r.json())
      .then((d) => {
        if (d.campaigns) {
          setCampaigns(d.campaigns.map((c: { id: string; campaignCode: string }) => ({
            id: c.id,
            campaignCode: c.campaignCode,
          })));
        }
      });
  }, []);

  const load = async () => {
    setError('');
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    if (status) params.set('status', status);
    if (externalOrderId) params.set('externalOrderId', externalOrderId);
    if (codeLast4) params.set('codeLast4', codeLast4);
    if (email) params.set('email', email);
    const res = await fetch(`/api/akman/vouchers?${params}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '실패');
      return;
    }
    setRows(data.vouchers || []);
    setTotal(data.total || 0);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={shell}>
      <p style={{ marginBottom: 12 }}>
        <Link href="/akman">← 관리자</Link>
        {' · '}
        <Link href="/akman/vouchers/campaigns">캠페인</Link>
        {' · '}
        <Link href="/akman/vouchers/imports">CSV 발급</Link>
      </p>
      <h1 style={{ fontSize: 22 }}>이용권 목록</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={{ height: 32 }}>
          <option value="">캠페인 전체</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.campaignCode}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ height: 32 }}>
          <option value="">상태 전체</option>
          <option value="ISSUED">ISSUED</option>
          <option value="REDEEMED">REDEEMED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <input
          placeholder="externalOrderId"
          value={externalOrderId}
          onChange={(e) => setExternalOrderId(e.target.value)}
          style={{ height: 32, padding: '0 8px' }}
        />
        <input
          placeholder="codeLast4"
          value={codeLast4}
          onChange={(e) => setCodeLast4(e.target.value)}
          style={{ height: 32, width: 90, padding: '0 8px' }}
        />
        <input
          placeholder="사용자 이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ height: 32, padding: '0 8px' }}
        />
        <button type="button" onClick={() => void load()} style={{ height: 32, padding: '0 12px' }}>
          검색
        </button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <p style={{ fontSize: 12, color: '#666' }}>총 {total}건 (코드 원문 미표시)</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>캠페인/리워드</th>
            <th>주문</th>
            <th>last4</th>
            <th>상태</th>
            <th>사용자</th>
            <th>Entitlement</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 6 }}>
                {v.providerCode}/{v.campaignCode}
                <br />
                {v.rewardCode}
              </td>
              <td>
                {v.externalOrderId} #{v.unitIndex}
                {v.purchaseAmount != null ? ` · ${v.purchaseAmount}` : ''}
              </td>
              <td>
                {v.codeLast4} (v{v.codeVersion})
              </td>
              <td>{v.status}</td>
              <td>{v.redeemedBy?.email || '—'}</td>
              <td>
                {v.entitlement
                  ? `${v.entitlement.lifecycleStatus}${
                      v.entitlement.endsAt
                        ? ` · ~${new Date(v.entitlement.endsAt).toLocaleDateString('ko-KR')}`
                        : ''
                    }`
                  : '—'}
              </td>
              <td>
                <Link href={`/akman/vouchers/${v.id}`}>상세</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
