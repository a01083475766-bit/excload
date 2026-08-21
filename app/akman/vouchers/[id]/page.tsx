'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const shell: React.CSSProperties = {
  padding: '24px 40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '900px',
};

export default function AkmanVoucherDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [voucher, setVoucher] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [reissueCode, setReissueCode] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [allowRecascade, setAllowRecascade] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<unknown>(null);

  const load = async () => {
    setError('');
    const res = await fetch(`/api/akman/vouchers/${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '실패');
      return;
    }
    setVoucher(data.voucher);
    const ent = data.voucher?.entitlement as
      | { startsAt?: string; endsAt?: string }
      | null
      | undefined;
    if (ent?.startsAt) setStartsAt(new Date(ent.startsAt).toISOString().slice(0, 16));
    if (ent?.endsAt) setEndsAt(new Date(ent.endsAt).toISOString().slice(0, 16));
  };

  useEffect(() => {
    if (id) void load();
  }, [id]);

  const reissue = async () => {
    if (!confirm('ISSUED만 재발급됩니다. 기존 코드는 즉시 무효입니다.')) return;
    const res = await fetch(`/api/akman/vouchers/${id}/reissue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || '실패');
      return;
    }
    setReissueCode(data.voucherCode);
    setMsg('재발급 완료. 아래 원문은 다시 볼 수 없습니다.');
    void load();
  };

  const previewCancel = async () => {
    const res = await fetch('/api/akman/vouchers/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucherIds: [id], previewOnly: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || '실패');
      return;
    }
    setCancelPreview(data.impact);
  };

  const confirmCancel = async () => {
    if (!confirm('취소·회수를 확정할까요? 다른 PRO 출처는 유지됩니다.')) return;
    const res = await fetch('/api/akman/vouchers/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucherIds: [id], confirmed: true, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || '실패');
      return;
    }
    setMsg('취소 처리 완료');
    setCancelPreview(null);
    void load();
  };

  const transfer = async () => {
    if (!confirm('계정 이전을 확정할까요? 기간은 초기화되지 않습니다.')) return;
    const res = await fetch(`/api/akman/vouchers/${id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmail, reason, confirmed: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || '실패');
      return;
    }
    setMsg('이전 완료');
    void load();
  };

  const adjust = async () => {
    const ent = voucher?.entitlement as { id?: string } | null;
    if (!ent?.id) {
      setMsg('Entitlement 없음');
      return;
    }
    const res = await fetch(`/api/akman/vouchers/entitlements/${ent.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        allowRecascade,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || '실패');
      return;
    }
    setMsg('기간 조정 완료');
    void load();
  };

  if (!voucher && !error) return <div style={shell}>불러오는 중…</div>;

  const campaign = voucher?.campaign as Record<string, unknown> | undefined;
  const reward = voucher?.rewardPolicy as Record<string, unknown> | undefined;
  const redeemedBy = voucher?.redeemedBy as { email?: string; id?: string } | null;
  const entitlement = voucher?.entitlement as Record<string, unknown> | null;
  const audits = (voucher?.auditLogs as Array<Record<string, unknown>>) || [];

  return (
    <div style={shell}>
      <p>
        <Link href="/akman/vouchers">← 목록</Link>
      </p>
      <h1 style={{ fontSize: 22 }}>이용권 상세</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {msg && <p style={{ color: '#065' }}>{msg}</p>}
      {reissueCode && (
        <p style={{ background: '#fff3cd', padding: 8 }}>
          새 코드(1회): <code>{reissueCode}</code>
        </p>
      )}

      <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          {(
            [
              ['제공처', campaign?.providerCode],
              ['캠페인', campaign?.campaignCode],
              ['리워드', reward?.rewardCode],
              ['주문', `${voucher?.externalOrderId} #${voucher?.unitIndex}`],
              ['금액', voucher?.purchaseAmount],
              ['last4', `${voucher?.codeLast4} (v${voucher?.codeVersion})`],
              ['상태', voucher?.status],
              ['스냅샷', `${voucher?.durationMonthsSnapshot}개월 / ${voucher?.pointsModeSnapshot}`],
              ['사용자', redeemedBy?.email || '—'],
              [
                'Entitlement',
                entitlement
                  ? `${entitlement.lifecycleStatus} ${entitlement.startsAt || ''} ~ ${entitlement.endsAt || ''}`
                  : '—',
              ],
            ] as const
          ).map(([k, v]) => (
            <tr key={k}>
              <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: '#555' }}>{k}</th>
              <td>{String(v ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ marginTop: 24, fontSize: 13 }}>
        <h2 style={{ fontSize: 16 }}>사유 (재발급/취소/이전/조정 공통)</h2>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ width: '100%', height: 32, marginBottom: 8 }}
          placeholder="관리자 사유*"
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => void reissue()}>
            재발급 (ISSUED만)
          </button>
          <button type="button" onClick={() => void previewCancel()}>
            취소 미리보기
          </button>
          <button type="button" onClick={() => void confirmCancel()}>
            취소 확정
          </button>
        </div>
      </section>

      {cancelPreview != null && (
        <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, overflow: 'auto' }}>
          {JSON.stringify(cancelPreview, null, 2)}
        </pre>
      )}

      <section style={{ marginTop: 24, fontSize: 13 }}>
        <h2 style={{ fontSize: 16 }}>계정 이전 (REDEEMED만)</h2>
        <input
          placeholder="대상 이메일"
          value={targetEmail}
          onChange={(e) => setTargetEmail(e.target.value)}
          style={{ height: 32, width: 280, marginRight: 8 }}
        />
        <button type="button" onClick={() => void transfer()}>
          이전 확정
        </button>
      </section>

      <section style={{ marginTop: 24, fontSize: 13 }}>
        <h2 style={{ fontSize: 16 }}>이용기간 조정</h2>
        <label>
          시작(로컬){' '}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>{' '}
        <label>
          종료(로컬){' '}
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginTop: 8 }}>
          <input
            type="checkbox"
            checked={allowRecascade}
            onChange={(e) => setAllowRecascade(e.target.checked)}
          />{' '}
          후속 이용권 대기열 재계산 허용
        </label>
        <button type="button" style={{ marginTop: 8 }} onClick={() => void adjust()}>
          기간 저장
        </button>
      </section>

      <section style={{ marginTop: 24, fontSize: 13 }}>
        <h2 style={{ fontSize: 16 }}>Audit</h2>
        <ul>
          {audits.map((a) => (
            <li key={String(a.id)}>
              {String(a.createdAt)} · {String(a.action)} · {String(a.result)}
              {a.reason ? ` · ${String(a.reason)}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
