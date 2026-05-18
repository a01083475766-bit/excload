'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONTACT_INQUIRY_STATUS_LABELS,
  type ContactInquiryStatus,
} from '@/app/lib/contact-inquiry';

interface ContactInquiryRow {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  company: string | null;
  phone: string | null;
  attachmentName: string | null;
  status: ContactInquiryStatus;
  mailSent: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export default function AkmanContactInquiriesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ContactInquiryRow[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ContactInquiryStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const loadRows = async (filter: typeof statusFilter = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter !== 'ALL' ? `?status=${filter}` : '';
      const res = await fetch(`/api/akman/contact-inquiries${qs}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '고객문의 목록을 불러오지 못했습니다.');
      }
      setRows(data.inquiries || []);
      setNewCount(typeof data.newCount === 'number' ? data.newCount : 0);
    } catch (e) {
      setRows([]);
      setNewCount(0);
      setError(e instanceof Error ? e.message : '고객문의 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    setNoteDraft(selected?.adminNote ?? '');
  }, [selected?.id, selected?.adminNote]);

  const updateStatus = async (id: string, status: ContactInquiryStatus) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/akman/contact-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '상태 변경에 실패했습니다.');
      }
      setRows((prev) => prev.map((r) => (r.id === id ? data.inquiry : r)));
      void loadRows();
    } catch (e) {
      alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveNote = async (id: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/akman/contact-inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, adminNote: noteDraft }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || '메모 저장에 실패했습니다.');
      }
      setRows((prev) => prev.map((r) => (r.id === id ? data.inquiry : r)));
      alert('메모가 저장되었습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '메모 저장에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>고객문의</h1>
          <p style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>
            신규 {newCount}건 · 최근 100건 표시
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/akman')}
          style={{
            border: '1px solid #d0d5dd',
            background: '#fff',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          대시보드로
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['ALL', 'NEW', 'IN_PROGRESS', 'RESOLVED'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setStatusFilter(key);
              void loadRows(key);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #d0d5dd',
              background: statusFilter === key ? '#eff4ff' : '#fff',
              color: statusFilter === key ? '#175cd3' : '#344054',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {key === 'ALL' ? '전체' : CONTACT_INQUIRY_STATUS_LABELS[key]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void loadRows()}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #d0d5dd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          새로고침
        </button>
      </div>

      {loading && <p style={{ color: '#667085' }}>불러오는 중…</p>}
      {!loading && error && (
        <p style={{ color: '#b42318', background: '#fef3f2', padding: '10px 12px', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p style={{ color: '#667085' }}>고객문의 내역이 없습니다.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ border: '1px solid #eaecf0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ maxHeight: 640, overflowY: 'auto' }}>
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    border: 'none',
                    borderTop: '1px solid #f2f4f7',
                    background: selectedId === row.id ? '#eff4ff' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#175cd3' }}>{row.typeLabel}</span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background:
                          row.status === 'NEW'
                            ? '#fef0c7'
                            : row.status === 'IN_PROGRESS'
                              ? '#e0eaff'
                              : '#ecfdf3',
                        color:
                          row.status === 'NEW'
                            ? '#b54708'
                            : row.status === 'IN_PROGRESS'
                              ? '#175cd3'
                              : '#027a48',
                      }}
                    >
                      {CONTACT_INQUIRY_STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{row.subject}</div>
                  <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
                    {row.name} · {row.email}
                  </div>
                  <div style={{ fontSize: 11, color: '#98a2b3', marginTop: 4 }}>
                    {new Date(row.createdAt).toLocaleString('ko-KR')}
                    {!row.mailSent && ' · 메일 미발송'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              border: '1px solid #eaecf0',
              borderRadius: 10,
              padding: 16,
              minHeight: 320,
              background: '#fff',
            }}
          >
            {!selected && (
              <p style={{ color: '#667085', fontSize: 14 }}>왼쪽 목록에서 문의를 선택하세요.</p>
            )}
            {selected && (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{selected.subject}</h2>
                <table style={{ width: '100%', fontSize: 13, marginBottom: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#667085', padding: '4px 8px 4px 0', width: 72 }}>유형</td>
                      <td>{selected.typeLabel}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>이름</td>
                      <td>{selected.name}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>이메일</td>
                      <td>
                        <a href={`mailto:${selected.email}`} style={{ color: '#175cd3' }}>
                          {selected.email}
                        </a>
                      </td>
                    </tr>
                    {selected.company && (
                      <tr>
                        <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>회사</td>
                        <td>{selected.company}</td>
                      </tr>
                    )}
                    {selected.phone && (
                      <tr>
                        <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>연락처</td>
                        <td>{selected.phone}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>접수</td>
                      <td>{new Date(selected.createdAt).toLocaleString('ko-KR')}</td>
                    </tr>
                    {selected.attachmentName && (
                      <tr>
                        <td style={{ color: '#667085', padding: '4px 8px 4px 0' }}>첨부</td>
                        <td>{selected.attachmentName} (메일 확인)</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>문의 내용</p>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13,
                    lineHeight: 1.6,
                    background: '#f9fafb',
                    border: '1px solid #eaecf0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    fontFamily: 'inherit',
                  }}
                >
                  {selected.message}
                </pre>

                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>관리자 메모</p>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #d0d5dd',
                    marginBottom: 8,
                    resize: 'vertical',
                  }}
                  placeholder="내부 메모 (고객에게 보이지 않음)"
                />
                <button
                  type="button"
                  disabled={updatingId === selected.id}
                  onClick={() => void saveNote(selected.id)}
                  style={{
                    marginRight: 8,
                    marginBottom: 12,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #d0d5dd',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  메모 저장
                </button>

                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>처리 상태</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['NEW', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={updatingId === selected.id || selected.status === st}
                      onClick={() => void updateStatus(selected.id, st)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid #d0d5dd',
                        background: selected.status === st ? '#f2f4f7' : '#fff',
                        cursor: selected.status === st ? 'default' : 'pointer',
                        fontSize: 13,
                        opacity: updatingId === selected.id ? 0.6 : 1,
                      }}
                    >
                      {CONTACT_INQUIRY_STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
