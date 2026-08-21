'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { buildCsvWithBom } from '@/app/lib/voucher/csv-parse';

const shell: React.CSSProperties = {
  padding: '24px 40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '960px',
};

type Reward = { id: string; rewardCode: string; durationMonths: number; soldPriceKrw: number | null };

export default function AkmanVoucherImportsPage() {
  const [campaigns, setCampaigns] = useState<
    Array<{ id: string; campaignCode: string; rewardPolicies: Reward[] }>
  >([]);
  const [campaignId, setCampaignId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    externalOrderId: '',
    rewardKey: '',
    quantity: '',
    purchaseAmount: '',
    buyerName: '',
    buyerEmail: '',
  });
  const [rewardNames, setRewardNames] = useState<string[]>([]);
  const [rewardNameMap, setRewardNameMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [commitResult, setCommitResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [rowIsOneUnit, setRowIsOneUnit] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedRewards = useMemo(
    () => campaigns.find((c) => c.id === campaignId)?.rewardPolicies || [],
    [campaigns, campaignId],
  );

  useEffect(() => {
    void fetch('/api/akman/vouchers/campaigns')
      .then((r) => r.json())
      .then((d) => {
        if (d.campaigns) {
          setCampaigns(
            d.campaigns.map(
              (c: {
                id: string;
                campaignCode: string;
                rewardPolicies: Reward[];
              }) => ({
                id: c.id,
                campaignCode: c.campaignCode,
                rewardPolicies: c.rewardPolicies || [],
              }),
            ),
          );
        }
      });
  }, []);

  const onFile = async (file: File | null) => {
    setCommitResult(null);
    setPreview(null);
    setError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('5MB 초과');
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
    // lightweight header peek (quoted commas rare in header row)
    const hs: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i]!;
      if (q) {
        if (ch === '"' && firstLine[i + 1] === '"') {
          cur += '"';
          i++;
          continue;
        }
        if (ch === '"') {
          q = false;
          continue;
        }
        cur += ch;
        continue;
      }
      if (ch === '"') {
        q = true;
        continue;
      }
      if (ch === ',') {
        hs.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    hs.push(cur.trim());
    setHeaders(hs.filter(Boolean));
  };

  const listRewards = async () => {
    if (!campaignId || !csvText || !mapping.rewardKey) {
      setError('캠페인·CSV·리워드 컬럼을 지정하세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/akman/vouchers/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'list-reward-names',
          campaignId,
          csvText,
          rewardHeader: mapping.rewardKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '실패');
        return;
      }
      setRewardNames(data.names || []);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setBusy(true);
    setError('');
    setCommitResult(null);
    try {
      const res = await fetch('/api/akman/vouchers/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          campaignId,
          csvText,
          fileName,
          mapping: {
            externalOrderId: mapping.externalOrderId,
            rewardKey: mapping.rewardKey,
            quantity: mapping.quantity || null,
            purchaseAmount: mapping.purchaseAmount || null,
            buyerName: mapping.buyerName || null,
            buyerEmail: mapping.buyerEmail || null,
          },
          rewardNameMap,
          rowIsOneUnit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '미리보기 실패');
        return;
      }
      setPreview(data);
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!confirm('발급을 확정할까요? 신규 코드 원문은 한 번만 내려받을 수 있습니다.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/akman/vouchers/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          confirmed: true,
          campaignId,
          csvText,
          fileName,
          mapping: {
            externalOrderId: mapping.externalOrderId,
            rewardKey: mapping.rewardKey,
            quantity: mapping.quantity || null,
            purchaseAmount: mapping.purchaseAmount || null,
            buyerName: mapping.buyerName || null,
            buyerEmail: mapping.buyerEmail || null,
          },
          rewardNameMap,
          rowIsOneUnit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '발급 실패');
        return;
      }
      setCommitResult(data);
      downloadResultCsv(data);
    } finally {
      setBusy(false);
    }
  };

  const downloadResultCsv = (data: Record<string, unknown>) => {
    const created = (data.created as Array<Record<string, unknown>>) || [];
    const existing = (data.existing as Array<Record<string, unknown>>) || [];
    const headersOut = [
      'externalOrderId',
      'unitIndex',
      'externalRewardName',
      'rewardCode',
      'durationMonths',
      'purchaseAmount',
      'buyerName',
      'buyerEmail',
      'voucherCode',
      'codeLast4',
      'status',
      'outcome',
    ];
    const rows = [...created, ...existing].map((r) =>
      headersOut.map((h) => String(r[h] ?? '')),
    );
    const csv = buildCsvWithBom(headersOut, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voucher-codes-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={shell}>
      <p style={{ marginBottom: 12 }}>
        <Link href="/akman/vouchers">← 이용권</Link>
      </p>
      <h1 style={{ fontSize: 22 }}>CSV 이용권 발급</h1>
      <p style={{ fontSize: 13, color: '#666' }}>
        헤더는 하드코딩하지 않습니다. 매핑 후 미리보기 → 확정. 개인정보는 DB에 저장하지 않습니다. 코드
        원문은 확정 직후 1회 다운로드만 가능합니다.
      </p>

      <section style={{ marginTop: 16 }}>
        <label>
          캠페인{' '}
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            style={{ height: 32 }}
          >
            <option value="">선택</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaignCode}
              </option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 8 }}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
          />
        </div>
      </section>

      {headers.length > 0 && (
        <section style={{ marginTop: 16, fontSize: 13 }}>
          <h2 style={{ fontSize: 16 }}>헤더 매핑</h2>
          {(
            [
              ['externalOrderId', '주문번호*'],
              ['rewardKey', '리워드명*'],
              ['quantity', '수량'],
              ['purchaseAmount', '구매금액'],
              ['buyerName', '구매자명(미저장)'],
              ['buyerEmail', '이메일(미저장)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <label>
                {label}{' '}
                <select
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <label style={{ display: 'block', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={rowIsOneUnit}
              onChange={(e) => setRowIsOneUnit(e.target.checked)}
            />{' '}
            수량 컬럼 없으면 행당 1개
          </label>
          <button type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void listRewards()}>
            고유 리워드명 불러오기
          </button>
        </section>
      )}

      {rewardNames.length > 0 && (
        <section style={{ marginTop: 16, fontSize: 13 }}>
          <h2 style={{ fontSize: 16 }}>리워드 매핑</h2>
          {rewardNames.map((name) => (
            <div key={name} style={{ marginBottom: 6 }}>
              <code>{name}</code> →{' '}
              <select
                value={rewardNameMap[name] || ''}
                onChange={(e) =>
                  setRewardNameMap((m) => ({ ...m, [name]: e.target.value }))
                }
              >
                <option value="">선택</option>
                {selectedRewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rewardCode} ({r.durationMonths}개월
                    {r.soldPriceKrw != null ? `/${r.soldPriceKrw}` : ''})
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" disabled={busy} onClick={() => void runPreview()}>
            미리보기
          </button>
        </section>
      )}

      {preview && (
        <section style={{ marginTop: 16, fontSize: 13 }}>
          <h2 style={{ fontSize: 16 }}>미리보기</h2>
          <p>
            예상 코드 {String(preview.estimatedCodes)} · 오류 {String(preview.errors)} · 확정가능{' '}
            {String(preview.canCommit)}
          </p>
          <ul>
            {((preview.previewRows as Array<{ kind: string; message?: string; externalOrderId?: string }>) || [])
              .filter((r) => r.kind === 'error')
              .slice(0, 20)
              .map((r, i) => (
                <li key={i} style={{ color: 'crimson' }}>
                  {r.message} {r.externalOrderId || ''}
                </li>
              ))}
          </ul>
          {Boolean(preview.canCommit) && (
            <button type="button" disabled={busy} onClick={() => void runCommit()}>
              발급 확정 + 결과 CSV 다운로드
            </button>
          )}
        </section>
      )}

      {commitResult && (
        <section style={{ marginTop: 16, fontSize: 13, background: '#f7f7f7', padding: 12 }}>
          <p>
            신규 {(commitResult.created as unknown[])?.length ?? 0} · 기존{' '}
            {(commitResult.existing as unknown[])?.length ?? 0} · 충돌{' '}
            {(commitResult.conflicts as unknown[])?.length ?? 0}
          </p>
          <p style={{ color: '#a00' }}>{String(commitResult.notice || '')}</p>
          <button type="button" onClick={() => downloadResultCsv(commitResult)}>
            결과 CSV 다시 받기 (이 세션 응답 데이터)
          </button>
        </section>
      )}

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}

      <hr style={{ margin: '32px 0' }} />
      <ManualIssue campaigns={campaigns} />
      <hr style={{ margin: '32px 0' }} />
      <CancelCsvImport campaigns={campaigns} />
    </div>
  );
}

function ManualIssue({
  campaigns,
}: {
  campaigns: Array<{ id: string; campaignCode: string; rewardPolicies: Reward[] }>;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [rewardPolicyId, setRewardPolicyId] = useState('');
  const [externalOrderId, setExternalOrderId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const rewards = campaigns.find((c) => c.id === campaignId)?.rewardPolicies || [];

  const submit = async () => {
    setError('');
    const res = await fetch('/api/akman/vouchers/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        rewardPolicyId,
        externalOrderId,
        quantity: Number(quantity),
        purchaseAmount: purchaseAmount ? Number(purchaseAmount) : null,
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '실패');
      return;
    }
    setResult(data);
  };

  return (
    <section style={{ fontSize: 13 }}>
      <h2 style={{ fontSize: 16 }}>단건 발급</h2>
      <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
          <option value="">캠페인</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.campaignCode}
            </option>
          ))}
        </select>
        <select value={rewardPolicyId} onChange={(e) => setRewardPolicyId(e.target.value)}>
          <option value="">리워드</option>
          {rewards.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rewardCode}
            </option>
          ))}
        </select>
        <input
          placeholder="externalOrderId"
          value={externalOrderId}
          onChange={(e) => setExternalOrderId(e.target.value)}
        />
        <input placeholder="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <input
          placeholder="purchaseAmount"
          value={purchaseAmount}
          onChange={(e) => setPurchaseAmount(e.target.value)}
        />
        <input placeholder="사유*" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="button" onClick={() => void submit()}>
          발급
        </button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <pre style={{ marginTop: 8, background: '#f5f5f5', padding: 8, overflow: 'auto' }}>
          {JSON.stringify(result.created || result, null, 2)}
        </pre>
      )}
    </section>
  );
}

function CancelCsvImport({
  campaigns,
}: {
  campaigns: Array<{ id: string; campaignCode: string; rewardPolicies: Reward[] }>;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [orderHeader, setOrderHeader] = useState('');
  const [qtyHeader, setQtyHeader] = useState('');
  const [unitHeader, setUnitHeader] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [reason, setReason] = useState('CANCEL_CSV');
  const [error, setError] = useState('');

  const onFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    const line = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
    setHeaders(line.split(',').map((h) => h.trim().replace(/^"|"$/g, '')));
    setPreview(null);
  };

  const run = async (commit: boolean) => {
    setError('');
    const res = await fetch('/api/akman/vouchers/cancel-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: commit ? 'commit' : 'preview',
        confirmed: commit,
        campaignId,
        csvText,
        reason,
        mapping: {
          externalOrderId: orderHeader,
          quantity: qtyHeader || null,
          unitIndex: unitHeader || null,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || '실패');
      return;
    }
    setPreview(data);
  };

  return (
    <section style={{ fontSize: 13 }}>
      <h2 style={{ fontSize: 16 }}>취소·환불 CSV</h2>
      <p style={{ color: '#666' }}>
        부분수량인데 unitIndex가 없으면 자동 취소하지 않고 모호 건으로 표시합니다.
      </p>
      <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
        <option value="">캠페인</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.campaignCode}
          </option>
        ))}
      </select>{' '}
      <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0] || null)} />
      {headers.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <label>
            주문번호{' '}
            <select value={orderHeader} onChange={(e) => setOrderHeader(e.target.value)}>
              <option value="">—</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            수량(선택){' '}
            <select value={qtyHeader} onChange={(e) => setQtyHeader(e.target.value)}>
              <option value="">—</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            unitIndex(선택){' '}
            <select value={unitHeader} onChange={(e) => setUnitHeader(e.target.value)}>
              <option value="">—</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: 8 }}>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유" />
          </div>
          <button type="button" style={{ marginTop: 8 }} onClick={() => void run(false)}>
            미리보기
          </button>{' '}
          <button
            type="button"
            disabled={!preview || !preview.canCommit}
            onClick={() => void run(true)}
          >
            취소 확정
          </button>
        </div>
      )}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {preview && (
        <pre style={{ marginTop: 8, background: '#f5f5f5', padding: 8, overflow: 'auto' }}>
          {JSON.stringify(
            {
              canCommit: preview.canCommit,
              counts: preview.counts,
              ambiguous: preview.ambiguous,
              notFound: preview.notFound,
              errors: preview.errors,
            },
            null,
            2,
          )}
        </pre>
      )}
    </section>
  );
}
