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
  const [forceResend, setForceResend] = useState(false);
  const [confirmIssueOnly, setConfirmIssueOnly] = useState(false);
  const [confirmIssueEmail, setConfirmIssueEmail] = useState(false);

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

  const runCommit = async (sendEmails: boolean) => {
    const msg = sendEmails
      ? '발급을 확정하고 이메일을 발송할까요? 미리보기에서는 메일이 나가지 않으며, 신규 코드 원문은 한 번만 내려받을 수 있습니다.'
      : '발급만 확정할까요? 이메일은 발송되지 않습니다. 신규 코드 원문은 한 번만 내려받을 수 있습니다.';
    if (!confirm(msg)) return;
    if (sendEmails && !confirmIssueEmail) {
      setError('이메일 발송 전 최종 확인 체크박스를 선택해 주세요.');
      return;
    }
    if (!sendEmails && !confirmIssueOnly) {
      setError('발급 전 최종 확인 체크박스를 선택해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/akman/vouchers/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          confirmed: true,
          sendEmails,
          forceResend: sendEmails ? forceResend : false,
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
      'voucherId',
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

  const downloadFailedEmailCsv = (data: Record<string, unknown>) => {
    const email = data.email as
      | {
          groups?: Array<{
            status: string;
            recipientEmailMasked: string;
            externalOrderIds: string[];
            voucherIds: string[];
            errorCode: string | null;
          }>;
        }
      | undefined;
    const failed = (email?.groups || []).filter(
      (g) => g.status === 'FAILED' || (g.status === 'SKIPPED' && g.errorCode !== 'ALREADY_SENT'),
    );
    const headersOut = [
      'status',
      'errorCode',
      'recipientEmailMasked',
      'externalOrderIds',
      'voucherIds',
    ];
    const rows = failed.map((g) => [
      g.status,
      g.errorCode || '',
      g.recipientEmailMasked,
      (g.externalOrderIds || []).join('|'),
      (g.voucherIds || []).join('|'),
    ]);
    const csv = buildCsvWithBom(headersOut, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voucher-email-failed-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailStats = preview?.emailStats as
    | {
        buyerCount: number;
        codeCount: number;
        emailEligibleCount: number;
        emailInvalidCount: number;
        invalidRows?: Array<{ externalOrderId: string; unitIndex: number; reason: string }>;
      }
    | undefined;

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
          <h2 style={{ fontSize: 16 }}>미리보기 · 최종 확인</h2>
          <p style={{ color: '#666' }}>미리보기 단계에서는 이메일이 발송되지 않습니다.</p>
          <p>
            예상 코드 {String(preview.estimatedCodes)} · 오류 {String(preview.errors)} · 확정가능{' '}
            {String(preview.canCommit)}
          </p>
          {emailStats && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                border: '1px solid #ddd',
                background: '#fafafa',
              }}
            >
              <p style={{ margin: '0 0 6px', fontWeight: 600 }}>이메일 발송 예정 요약</p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>전체 구매자 수(이메일 기준): {emailStats.buyerCount}</li>
                <li>발급 코드 수: {emailStats.codeCount}</li>
                <li>이메일 발송 대상 수: {emailStats.emailEligibleCount}</li>
                <li>이메일 누락·형식 오류 수: {emailStats.emailInvalidCount}</li>
              </ul>
              {(emailStats.invalidRows || []).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 4px', color: '#a00' }}>오류 목록 (자동 발송 제외)</p>
                  <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
                    {(emailStats.invalidRows || []).slice(0, 50).map((r, i) => (
                      <li key={i}>
                        {r.externalOrderId} #{r.unitIndex} — {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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
            <div style={{ marginTop: 12, display: 'grid', gap: 10, maxWidth: 520 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={confirmIssueOnly}
                  onChange={(e) => setConfirmIssueOnly(e.target.checked)}
                />
                <span>① 매핑·미리보기를 확인했습니다. 발급만 진행합니다(이메일 없음).</span>
              </label>
              <button
                type="button"
                disabled={busy || !confirmIssueOnly}
                style={{ height: 32, maxWidth: 280 }}
                onClick={() => void runCommit(false)}
              >
                발급만 하고 CSV 다운로드
              </button>

              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={confirmIssueEmail}
                  onChange={(e) => setConfirmIssueEmail(e.target.checked)}
                />
                <span>
                  ② 매핑·이메일 대상 요약을 확인했습니다. 발급 후 이메일을 자동 발송합니다
                  (WADIZ_2026_01, 유효 이메일만).
                </span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={forceResend}
                  onChange={(e) => setForceResend(e.target.checked)}
                />
                <span style={{ color: '#666' }}>
                  이미 발송된 대상도 재발송 (기본 꺼짐 · 코드는 재발급하지 않음)
                </span>
              </label>
              <button
                type="button"
                disabled={
                  busy ||
                  !confirmIssueEmail ||
                  !preview.emailCampaignAllowed ||
                  !mapping.buyerEmail
                }
                style={{ height: 32, maxWidth: 320 }}
                onClick={() => void runCommit(true)}
              >
                발급 확정 + 이메일 자동 발송
              </button>
              {!preview.emailCampaignAllowed && (
                <p style={{ color: '#a00', margin: 0 }}>
                  자동 이메일은 WADIZ_2026_01 캠페인에서만 가능합니다.
                </p>
              )}
              {!mapping.buyerEmail && (
                <p style={{ color: '#a00', margin: 0 }}>이메일 발송에는 buyerEmail 매핑이 필요합니다.</p>
              )}
            </div>
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
          {commitResult.email != null ? (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>이메일 발송 결과</p>
              <p>
                성공 {(commitResult.email as { sent?: number }).sent ?? 0} · 실패{' '}
                {(commitResult.email as { failed?: number }).failed ?? 0} · 건너뜀{' '}
                {(commitResult.email as { skipped?: number }).skipped ?? 0}
              </p>
              <ul style={{ maxHeight: 160, overflow: 'auto' }}>
                {(
                  (commitResult.email as {
                    groups?: Array<{
                      status: string;
                      recipientEmailMasked: string;
                      errorCode: string | null;
                      voucherIds: string[];
                    }>;
                  }).groups || []
                )
                  .slice(0, 40)
                  .map((g, i) => (
                    <li key={i}>
                      [{g.status}] {g.recipientEmailMasked}
                      {g.errorCode ? ` — ${g.errorCode}` : ''} ({g.voucherIds?.length || 0}코드)
                    </li>
                  ))}
              </ul>
              <button type="button" style={{ marginTop: 6 }} onClick={() => downloadFailedEmailCsv(commitResult)}>
                실패·오류 대상 CSV 다운로드
              </button>
            </div>
          ) : null}
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => downloadResultCsv(commitResult)}>
              결과 CSV 다시 받기 (이 세션)
            </button>
          </div>
          <p style={{ marginTop: 8, color: '#666' }}>
            수동 재발송: 결과 CSV의 코드·이메일을 보관한 뒤, 아래「결과 CSV로 이메일 재발송」을
            사용하세요.
          </p>
        </section>
      )}

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}

      <hr style={{ margin: '32px 0' }} />
      <ResendFromResultCsv campaigns={campaigns} />
      <hr style={{ margin: '32px 0' }} />
      <ManualIssue campaigns={campaigns} />
      <hr style={{ margin: '32px 0' }} />
      <CancelCsvImport campaigns={campaigns} />
    </div>
  );
}

function ResendFromResultCsv({
  campaigns,
}: {
  campaigns: Array<{ id: string; campaignCode: string; rewardPolicies: Reward[] }>;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [forceResend, setForceResend] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parseAndSend = async () => {
    if (!confirmed) {
      setError('최종 확인 체크박스를 선택하세요.');
      return;
    }
    if (!campaignId || !csvText) {
      setError('캠페인과 결과 CSV가 필요합니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setError('CSV 행이 없습니다.');
        return;
      }
      const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const idx = (name: string) => headers.indexOf(name);
      const need = [
        'externalOrderId',
        'unitIndex',
        'voucherCode',
        'buyerEmail',
        'voucherId',
        'rewardCode',
      ];
      for (const n of need) {
        if (idx(n) < 0) {
          setError(`필수 컬럼 없음: ${n}`);
          return;
        }
      }
      const payloadLines: Array<Record<string, unknown>> = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]!.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        payloadLines.push({
          externalOrderId: cols[idx('externalOrderId')],
          unitIndex: Number(cols[idx('unitIndex')]),
          voucherCode: cols[idx('voucherCode')],
          buyerEmail: cols[idx('buyerEmail')] || null,
          buyerName: idx('buyerName') >= 0 ? cols[idx('buyerName')] : null,
          voucherId: cols[idx('voucherId')],
          rewardCode: cols[idx('rewardCode')],
          externalRewardName:
            idx('externalRewardName') >= 0 ? cols[idx('externalRewardName')] : null,
        });
      }
      const res = await fetch('/api/akman/vouchers/email-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          confirmed: true,
          forceResend,
          lines: payloadLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '발송 실패');
        return;
      }
      setResult(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ fontSize: 13 }}>
      <h2 style={{ fontSize: 16 }}>결과 CSV로 이메일 재발송</h2>
      <p style={{ color: '#666' }}>
        발급 결과 CSV(코드 원문 포함)로만 재발송합니다. 코드를 새로 발급하지 않습니다. 기본은 이미
        발송된 대상을 건너뜁니다.
      </p>
      <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
        <option value="">캠페인</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.campaignCode}
          </option>
        ))}
      </select>{' '}
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then(setCsvText);
        }}
      />
      <div style={{ marginTop: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={forceResend}
            onChange={(e) => setForceResend(e.target.checked)}
          />{' '}
          이미 발송된 대상도 재발송
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          결과 CSV 내용과 수신자를 확인했습니다
        </label>
      </div>
      <button type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void parseAndSend()}>
        이메일 발송
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result?.email != null ? (
        <pre style={{ marginTop: 8, background: '#f5f5f5', padding: 8, overflow: 'auto' }}>
          {JSON.stringify(
            {
              sent: (result.email as { sent?: number }).sent,
              failed: (result.email as { failed?: number }).failed,
              skipped: (result.email as { skipped?: number }).skipped,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </section>
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
