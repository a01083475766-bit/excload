'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type RefundStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

interface RefundRequestRow {
  id: string;
  userId: string;
  paymentId: string | null;
  type: string;
  status: RefundStatus;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  reason: string | null;
  createdAt: string;
  processedAt: string | null;
}

const statusLabel: Record<RefundStatus, string> = {
  REQUESTED: '요청',
  APPROVED: '승인',
  REJECTED: '반려',
  COMPLETED: '완료',
};

function maskAccountNumber(value: string | null): string {
  if (!value) return '-';
  const stripped = value.replace(/\s+/g, '');
  if (stripped.length <= 4) return `****${stripped}`;
  return `${'*'.repeat(Math.max(0, stripped.length - 4))}${stripped.slice(-4)}`;
}

function maskName(value: string | null): string {
  if (!value) return '-';
  const v = value.trim();
  if (v.length <= 1) return `${v}*`;
  if (v.length === 2) return `${v[0]}*`;
  return `${v[0]}${'*'.repeat(v.length - 2)}${v[v.length - 1]}`;
}

export default function AkmanRefundsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/akman/refund-requests', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '환불 신청 목록을 불러오지 못했습니다.');
      }
      setRows(data.requests || []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : '환불 신청 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const updateStatus = async (id: string, status: RefundStatus) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/akman/refund-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '상태 변경에 실패했습니다.');
      }
      setRows((prev) => prev.map((r) => (r.id === id ? data.request : r)));
      alert('상태가 변경되었습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>환불 신청 관리</h1>
        <button
          type="button"
          onClick={() => router.push('/akman')}
          style={{ border: '1px solid #d0d5dd', background: '#fff', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}
        >
          대시보드로
        </button>
      </div>

      {loading && <p style={{ color: '#667085' }}>불러오는 중…</p>}
      {!loading && error && (
        <p style={{ color: '#b42318', background: '#fef3f2', padding: '10px 12px', borderRadius: 8 }}>{error}</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p style={{ color: '#667085' }}>환불 신청 내역이 없습니다.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ border: '1px solid #eaecf0', borderRadius: 10, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 160px 110px 120px 220px 1fr 230px',
              gap: 8,
              background: '#f9fafb',
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <div>요청일</div>
            <div>사용자ID</div>
            <div>유형</div>
            <div>상태</div>
            <div>계좌정보</div>
            <div>사유/회신</div>
            <div>처리</div>
          </div>
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 160px 110px 120px 220px 1fr 230px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderTop: '1px solid #f2f4f7',
                  fontSize: 12,
                }}
              >
                <div>{new Date(row.createdAt).toLocaleString('ko-KR')}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.userId}</div>
                <div>{row.type}</div>
                <div>{statusLabel[row.status]}</div>
                <div style={{ whiteSpace: 'pre-line' }}>
                  {(row.bankName || '-') + '\n' + maskAccountNumber(row.accountNumber) + '\n' + maskName(row.accountHolder)}
                </div>
                <div style={{ color: '#475467' }}>{row.reason || '-'}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['APPROVED', 'REJECTED', 'COMPLETED'] as RefundStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={updatingId === row.id || row.status === s}
                      onClick={() => void updateStatus(row.id, s)}
                      style={{
                        border: '1px solid #d0d5dd',
                        background: row.status === s ? '#eff8ff' : '#fff',
                        borderRadius: 6,
                        padding: '4px 8px',
                        cursor: updatingId === row.id ? 'not-allowed' : 'pointer',
                        opacity: updatingId === row.id ? 0.6 : 1,
                      }}
                    >
                      {statusLabel[s]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
