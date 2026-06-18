'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type AuditEntry = {
  id: string;
  originalHeader: string;
  baseHeader: string | null;
  adminSelectedBaseHeader?: string | null;
  adminSelectedAt?: string | null;
  effectiveBaseHeader?: string | null;
  status: string;
  method: string;
  sampleValueType: string;
  maskedSamples: unknown;
  sampleCount: number;
  adminStatus: string;
  reviewedAt?: string | null;
  aliasStatus?: 'NOT_REGISTERED' | 'REGISTERED_SAME' | 'CONFLICT' | 'DB_ALIAS_SOURCE' | 'NOT_ELIGIBLE';
  existingAliasBaseHeader?: string | null;
};

type AliasLocalState = {
  status: 'created' | 'alreadyExists' | 'alreadyDbAlias' | 'conflict' | 'error';
  message: string;
};

type AuditLog = {
  id: string;
  source: string | null;
  totalHeaders: number;
  autoMatchedCount: number;
  unmappedCount: number;
  lowConfidenceCount: number;
  needsReviewCount: number;
  entriesWithMaskedSamplesCount: number;
  createdAt: string;
  entries: AuditEntry[];
};

type AuditResponse = {
  data: AuditLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type BaseHeadersResponse = {
  data?: string[];
  count?: number;
};

const STATUS_OPTIONS = ['', 'AUTO_MATCHED', 'LOW_CONFIDENCE', 'UNMAPPED', 'NEEDS_REVIEW', 'CONFIRMED', 'IGNORED'];
const METHOD_OPTIONS = ['', 'BASE_HEADER', 'DB_ALIAS', 'STATIC_ALIAS', 'AI', 'REFINED', 'UNMAPPED'];
const TYPE_OPTIONS = ['', 'DATE', 'MONEY', 'PHONE', 'ADDRESS', 'NAME', 'MESSAGE', 'CODE', 'STATUS', 'TEXT', 'EMPTY'];
const ADMIN_STATUS_OPTIONS = ['', 'PENDING', 'CONFIRMED', 'CHANGED', 'IGNORED', 'HOLD'];

const thStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: '1px solid #e4e4e7',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: '1px solid #f4f4f5',
  verticalAlign: 'top',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

function asMaskedSamples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function adminStatusStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };

  if (status === 'CONFIRMED') return { ...base, color: '#166534', background: '#dcfce7' };
  if (status === 'CHANGED') return { ...base, color: '#1d4ed8', background: '#dbeafe' };
  if (status === 'IGNORED') return { ...base, color: '#991b1b', background: '#fee2e2' };
  if (status === 'HOLD') return { ...base, color: '#92400e', background: '#fef3c7' };
  return { ...base, color: '#374151', background: '#e5e7eb' };
}

function aliasStateStyle(status: AliasLocalState['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };

  if (status === 'created') return { ...base, color: '#166534', background: '#dcfce7' };
  if (status === 'alreadyExists' || status === 'alreadyDbAlias') {
    return { ...base, color: '#1d4ed8', background: '#dbeafe' };
  }
  if (status === 'conflict') return { ...base, color: '#991b1b', background: '#fee2e2' };
  return { ...base, color: '#92400e', background: '#fef3c7' };
}

function apiAliasStatusLabel(entry: AuditEntry): string {
  if (entry.aliasStatus === 'REGISTERED_SAME') return '이미 DB 등록됨';
  if (entry.aliasStatus === 'CONFLICT') {
    return entry.existingAliasBaseHeader
      ? `다른 기준헤더로 등록됨: ${entry.existingAliasBaseHeader}`
      : '다른 기준헤더로 등록됨';
  }
  if (entry.aliasStatus === 'DB_ALIAS_SOURCE') return 'DB 별칭 기반';
  if (entry.aliasStatus === 'NOT_ELIGIBLE') return '추가 대상 아님';
  return '미등록';
}

function apiAliasStatusStyle(status: AuditEntry['aliasStatus']): React.CSSProperties {
  if (status === 'REGISTERED_SAME' || status === 'DB_ALIAS_SOURCE') {
    return aliasStateStyle('alreadyExists');
  }
  if (status === 'CONFLICT') return aliasStateStyle('conflict');
  if (status === 'NOT_ELIGIBLE') return aliasStateStyle('error');
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    color: '#374151',
    background: '#e5e7eb',
    whiteSpace: 'nowrap',
  };
}

export default function HeaderMappingAuditPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditResponse['pagination']>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [updatingEntryId, setUpdatingEntryId] = useState<string | null>(null);
  const [savingBaseHeaderEntryId, setSavingBaseHeaderEntryId] = useState<string | null>(null);
  const [aliasAddingEntryId, setAliasAddingEntryId] = useState<string | null>(null);
  const [aliasStates, setAliasStates] = useState<Record<string, AliasLocalState>>({});
  const [baseHeaders, setBaseHeaders] = useState<string[]>([]);
  const [selectedBaseHeaders, setSelectedBaseHeaders] = useState<Record<string, string>>({});
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [sampleValueType, setSampleValueType] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [originalHeader, setOriginalHeader] = useState('');
  const [baseHeader, setBaseHeader] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      entryLimit: '30',
    });
    if (status) params.set('status', status);
    if (method) params.set('method', method);
    if (sampleValueType) params.set('sampleValueType', sampleValueType);
    if (adminStatus) params.set('adminStatus', adminStatus);
    if (originalHeader.trim()) params.set('originalHeader', originalHeader.trim());
    if (baseHeader.trim()) params.set('baseHeader', baseHeader.trim());
    if (source.trim()) params.set('source', source.trim());
    return params.toString();
  }, [adminStatus, baseHeader, method, originalHeader, page, pageSize, sampleValueType, source, status]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/akman/header-mapping-audit?${query}`);
      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || '헤더 매핑 검토 로그를 불러오지 못했습니다.');
      }
      const body = (await response.json()) as AuditResponse;
      setLogs(Array.isArray(body.data) ? body.data : []);
      setPagination(body.pagination ?? { page, pageSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : '헤더 매핑 검토 로그 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, query, router]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    let cancelled = false;

    const fetchBaseHeaders = async () => {
      try {
        const response = await fetch('/api/akman/base-headers');
        if (response.status === 401 || response.status === 403) {
          router.push('/');
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error || '기준헤더 목록을 불러오지 못했습니다.');
        }
        const body = (await response.json()) as BaseHeadersResponse;
        if (!cancelled) {
          setBaseHeaders(Array.isArray(body.data) ? body.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setActionError(err instanceof Error ? err.message : '기준헤더 목록 조회 중 오류가 발생했습니다.');
        }
      }
    };

    fetchBaseHeaders();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const resetFilters = () => {
    setStatus('');
    setMethod('');
    setSampleValueType('');
    setAdminStatus('');
    setOriginalHeader('');
    setBaseHeader('');
    setSource('');
    setPage(1);
  };

  const updateEntryAdminStatus = async (
    entryId: string,
    nextStatus: 'CONFIRMED' | 'IGNORED' | 'HOLD',
  ) => {
    setActionError('');
    setUpdatingEntryId(entryId);
    try {
      const response = await fetch(`/api/akman/header-mapping-audit/${encodeURIComponent(entryId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminStatus: nextStatus }),
      });

      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || '검토 상태 변경에 실패했습니다.');
      }

      const updated = body?.entry as Partial<AuditEntry> | undefined;
      setLogs((prev) =>
        prev.map((log) => ({
          ...log,
          entries: log.entries.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  adminStatus: updated?.adminStatus ?? nextStatus,
                  reviewedAt: updated?.reviewedAt ?? entry.reviewedAt ?? null,
                  adminSelectedBaseHeader: updated?.adminSelectedBaseHeader ?? entry.adminSelectedBaseHeader ?? null,
                  adminSelectedAt: updated?.adminSelectedAt ?? entry.adminSelectedAt ?? null,
                  effectiveBaseHeader: updated?.effectiveBaseHeader ?? entry.effectiveBaseHeader ?? entry.baseHeader,
                }
              : entry,
          ),
        })),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '검토 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingEntryId(null);
    }
  };

  const getSelectedBaseHeaderValue = (entry: AuditEntry): string =>
    selectedBaseHeaders[entry.id] ?? entry.adminSelectedBaseHeader ?? entry.baseHeader ?? '';

  const saveSelectedBaseHeader = async (entry: AuditEntry) => {
    const selected = getSelectedBaseHeaderValue(entry).trim();
    if (!selected) {
      setActionError('저장할 기준헤더를 선택해 주세요.');
      return;
    }

    setActionError('');
    setSavingBaseHeaderEntryId(entry.id);
    try {
      const response = await fetch(`/api/akman/header-mapping-audit/${encodeURIComponent(entry.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSelectedBaseHeader: selected }),
      });

      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || '기준헤더 선택 저장에 실패했습니다.');
      }

      const updated = body?.entry as Partial<AuditEntry> | undefined;
      const nextEffectiveBaseHeader = updated?.adminSelectedBaseHeader ?? entry.baseHeader ?? null;
      setLogs((prev) =>
        prev.map((log) => ({
          ...log,
          entries: log.entries.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  adminSelectedBaseHeader: updated?.adminSelectedBaseHeader ?? selected,
                  adminSelectedAt: updated?.adminSelectedAt ?? item.adminSelectedAt ?? null,
                  effectiveBaseHeader: nextEffectiveBaseHeader,
                  adminStatus:
                    updated?.adminStatus ?? (nextEffectiveBaseHeader === item.baseHeader ? 'CONFIRMED' : 'CHANGED'),
                  reviewedAt: updated?.reviewedAt ?? item.reviewedAt ?? null,
                }
              : item,
          ),
        })),
      );
      setSelectedBaseHeaders((prev) => ({
        ...prev,
        [entry.id]: updated?.adminSelectedBaseHeader ?? selected,
      }));
      setAliasStates((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
      await fetchLogs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '기준헤더 선택 저장 중 오류가 발생했습니다.');
    } finally {
      setSavingBaseHeaderEntryId(null);
    }
  };

  const canAddDbAlias = (entry: AuditEntry): boolean =>
    (entry.adminStatus === 'CONFIRMED' || entry.adminStatus === 'CHANGED') &&
    entry.originalHeader.trim().length > 0 &&
    Boolean(entry.effectiveBaseHeader?.trim()) &&
    entry.method !== 'DB_ALIAS' &&
    entry.aliasStatus === 'NOT_REGISTERED' &&
    !aliasStates[entry.id];

  const addDbAlias = async (entry: AuditEntry) => {
    setActionError('');
    setAliasAddingEntryId(entry.id);
    try {
      const response = await fetch(
        `/api/akman/header-mapping-audit/${encodeURIComponent(entry.id)}/alias`,
        { method: 'POST' },
      );

      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        const message = '다른 기준헤더로 이미 등록됨';
        setAliasStates((prev) => ({
          ...prev,
          [entry.id]: { status: 'conflict', message },
        }));
        setActionError(message);
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error || 'DB 별칭 추가에 실패했습니다.');
      }

      const nextState: AliasLocalState = body?.alreadyExists
        ? { status: 'alreadyExists', message: '이미 등록됨' }
        : body?.alreadyDbAlias
          ? { status: 'alreadyDbAlias', message: '이미 DB 별칭 기반' }
          : { status: 'created', message: 'DB 별칭 추가 완료' };
      setAliasStates((prev) => ({
        ...prev,
        [entry.id]: nextState,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DB 별칭 추가 중 오류가 발생했습니다.';
      setAliasStates((prev) => ({
        ...prev,
        [entry.id]: { status: 'error', message },
      }));
      setActionError(message);
    } finally {
      setAliasAddingEntryId(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/akman" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Akman 대시보드
        </Link>
      </div>

      <h1 style={{ marginBottom: 8, fontSize: 22, fontWeight: 700 }}>헤더 매핑 검토 로그</h1>
      <p style={{ marginBottom: 16, fontSize: 14, color: '#52525b', lineHeight: 1.7 }}>
        원본 파일은 저장하지 않습니다. 개인정보 원문은 저장하거나 표시하지 않으며, 화면에는
        저장된 마스킹 샘플만 표시합니다. 시스템 자동 매핑 결과와 관리자 선택 기준헤더는 분리해서
        관리하며, 기존 시스템 기준헤더는 덮어쓰지 않습니다.
      </p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 16,
          padding: 12,
          background: '#f4f4f5',
          borderRadius: 8,
        }}
      >
        <label style={{ fontSize: 13 }}>
          status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || '전체'}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          method
          <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {METHOD_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || '전체'}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          sampleValueType
          <select value={sampleValueType} onChange={(e) => { setSampleValueType(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {TYPE_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || '전체'}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          adminStatus
          <select value={adminStatus} onChange={(e) => { setAdminStatus(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {ADMIN_STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || '전체'}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          originalHeader
          <input value={originalHeader} onChange={(e) => { setOriginalHeader(e.target.value); setPage(1); }} placeholder="원본 헤더 검색" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          baseHeader
          <input value={baseHeader} onChange={(e) => { setBaseHeader(e.target.value); setPage(1); }} placeholder="기준헤더 검색" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          source
          <input value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} placeholder="excel 등" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          pageSize
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button type="button" onClick={fetchLogs} style={{ padding: '8px 14px', border: 0, borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            조회
          </button>
          <button type="button" onClick={resetFilters} style={{ padding: '8px 14px', border: '1px solid #d4d4d8', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            초기화
          </button>
        </div>
      </section>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}
      {actionError && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
          {actionError}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#71717a' }}>헤더 매핑 검토 로그를 불러오는 중입니다.</p>
      ) : logs.length === 0 ? (
        <div style={{ padding: 24, border: '1px dashed #d4d4d8', borderRadius: 8, color: '#71717a' }}>
          조회 조건에 맞는 헤더 매핑 검토 로그가 없습니다.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e4e4e7', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#eff6ff' }}>
                <th style={thStyle}>생성일</th>
                <th style={thStyle}>source</th>
                <th style={thStyle}>totalHeaders</th>
                <th style={thStyle}>autoMatched</th>
                <th style={thStyle}>unmapped</th>
                <th style={thStyle}>lowConfidence</th>
                <th style={thStyle}>needsReview</th>
                <th style={thStyle}>maskedSamples</th>
                <th style={thStyle}>상세</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const expanded = expandedLogId === log.id;
                return (
                  <tr key={log.id}>
                    <td style={tdStyle}>{formatDate(log.createdAt)}</td>
                    <td style={tdStyle}>{log.source ?? '—'}</td>
                    <td style={tdStyle}>{log.totalHeaders}</td>
                    <td style={tdStyle}>{log.autoMatchedCount}</td>
                    <td style={tdStyle}>{log.unmappedCount}</td>
                    <td style={tdStyle}>{log.lowConfidenceCount}</td>
                    <td style={tdStyle}>{log.needsReviewCount}</td>
                    <td style={tdStyle}>{log.entriesWithMaskedSamplesCount}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        style={{ padding: '4px 8px', border: '1px solid #d4d4d8', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                      >
                        {expanded ? '접기' : '펼치기'}
                      </button>
                      {expanded && (
                        <div style={{ marginTop: 12, minWidth: 760 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff' }}>
                            <thead>
                              <tr style={{ background: '#fafafa' }}>
                                <th style={thStyle}>originalHeader</th>
                                <th style={thStyle}>기준헤더</th>
                                <th style={thStyle}>status</th>
                                <th style={thStyle}>method</th>
                                <th style={thStyle}>sampleValueType</th>
                                <th style={thStyle}>maskedSamples</th>
                                <th style={thStyle}>sampleCount</th>
                                <th style={thStyle}>adminStatus</th>
                                <th style={thStyle}>DB 별칭</th>
                                <th style={thStyle}>검토 액션</th>
                              </tr>
                            </thead>
                            <tbody>
                              {log.entries.length === 0 ? (
                                <tr>
                                  <td style={tdStyle} colSpan={10}>표시할 엔트리가 없습니다.</td>
                                </tr>
                              ) : (
                                log.entries.map((entry) => (
                                  <tr key={entry.id}>
                                    <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{entry.originalHeader}</td>
                                    <td style={{ ...tdStyle, minWidth: 260 }}>
                                      <div style={{ display: 'grid', gap: 6 }}>
                                        <div style={{ color: '#71717a', fontSize: 11 }}>
                                          시스템 기준헤더: {entry.baseHeader ?? '(미매핑)'}
                                        </div>
                                        <div>
                                          <span
                                            style={{
                                              display: 'inline-block',
                                              padding: '2px 8px',
                                              borderRadius: 999,
                                              background: '#eef2ff',
                                              color: '#3730a3',
                                              fontSize: 12,
                                              fontWeight: 700,
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            적용 기준헤더: {entry.effectiveBaseHeader ?? '(없음)'}
                                          </span>
                                          {entry.adminSelectedBaseHeader && (
                                            <span
                                              style={{
                                                display: 'inline-block',
                                                marginLeft: 6,
                                                padding: '2px 8px',
                                                borderRadius: 999,
                                                background: '#ecfdf5',
                                                color: '#047857',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                whiteSpace: 'nowrap',
                                              }}
                                            >
                                              관리자 선택
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                          <select
                                            value={getSelectedBaseHeaderValue(entry)}
                                            onChange={(event) =>
                                              setSelectedBaseHeaders((prev) => ({
                                                ...prev,
                                                [entry.id]: event.target.value,
                                              }))
                                            }
                                            style={{ minWidth: 150, padding: '4px 6px' }}
                                          >
                                            <option value="">기준헤더 선택</option>
                                            {baseHeaders.map((header) => (
                                              <option key={header} value={header}>
                                                {header}
                                              </option>
                                            ))}
                                          </select>
                                          <button
                                            type="button"
                                            disabled={savingBaseHeaderEntryId === entry.id || baseHeaders.length === 0}
                                            onClick={() => saveSelectedBaseHeader(entry)}
                                            style={{
                                              padding: '4px 8px',
                                              border: '1px solid #2563eb',
                                              borderRadius: 6,
                                              background:
                                                savingBaseHeaderEntryId === entry.id || baseHeaders.length === 0
                                                  ? '#eff6ff'
                                                  : '#fff',
                                              color: '#1d4ed8',
                                              cursor:
                                                savingBaseHeaderEntryId === entry.id || baseHeaders.length === 0
                                                  ? 'not-allowed'
                                                  : 'pointer',
                                              fontSize: 12,
                                              fontWeight: 700,
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            {savingBaseHeaderEntryId === entry.id ? '저장 중' : '선택 저장'}
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={tdStyle}>{entry.status}</td>
                                    <td style={tdStyle}>{entry.method}</td>
                                    <td style={tdStyle}>{entry.sampleValueType}</td>
                                    <td style={{ ...tdStyle, wordBreak: 'break-all' }}>
                                      {asMaskedSamples(entry.maskedSamples).length > 0
                                        ? asMaskedSamples(entry.maskedSamples).join(', ')
                                        : '—'}
                                    </td>
                                    <td style={tdStyle}>{entry.sampleCount}</td>
                                    <td style={tdStyle}>
                                      <span style={adminStatusStyle(entry.adminStatus)}>
                                        {entry.adminStatus || 'PENDING'}
                                      </span>
                                    </td>
                                    <td style={tdStyle}>
                                      {aliasStates[entry.id] ? (
                                        <span style={aliasStateStyle(aliasStates[entry.id].status)}>
                                          {aliasStates[entry.id].message}
                                        </span>
                                      ) : canAddDbAlias(entry) ? (
                                        <button
                                          type="button"
                                          disabled={aliasAddingEntryId === entry.id}
                                          onClick={() => addDbAlias(entry)}
                                          style={{
                                            padding: '4px 8px',
                                            border: '1px solid #2563eb',
                                            borderRadius: 6,
                                            background: aliasAddingEntryId === entry.id ? '#eff6ff' : '#fff',
                                            color: '#1d4ed8',
                                            cursor: aliasAddingEntryId === entry.id ? 'not-allowed' : 'pointer',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {aliasAddingEntryId === entry.id ? '추가 중' : 'DB 별칭 추가'}
                                        </button>
                                      ) : (
                                        <span style={apiAliasStatusStyle(entry.aliasStatus)}>
                                          {apiAliasStatusLabel(entry)}
                                        </span>
                                      )}
                                    </td>
                                    <td style={tdStyle}>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {[
                                          ['CONFIRMED', '확인'],
                                          ['IGNORED', '무시'],
                                          ['HOLD', '보류'],
                                        ].map(([nextStatus, label]) => {
                                          const disabled = updatingEntryId === entry.id;
                                          return (
                                            <button
                                              key={nextStatus}
                                              type="button"
                                              disabled={disabled}
                                              onClick={() =>
                                                updateEntryAdminStatus(
                                                  entry.id,
                                                  nextStatus as 'CONFIRMED' | 'IGNORED' | 'HOLD',
                                                )
                                              }
                                              style={{
                                                padding: '4px 8px',
                                                border: '1px solid #d4d4d8',
                                                borderRadius: 6,
                                                background: disabled ? '#f4f4f5' : '#fff',
                                                color: '#111827',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                fontSize: 12,
                                              }}
                                            >
                                              {disabled ? '처리 중' : label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <span style={{ fontSize: 13, color: '#52525b' }}>
          총 {pagination.total}건 · {pagination.page} / {Math.max(pagination.totalPages, 1)} 페이지
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            style={{ padding: '7px 12px', border: '1px solid #d4d4d8', borderRadius: 6, background: page <= 1 ? '#f4f4f5' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            이전
          </button>
          <button
            type="button"
            disabled={pagination.totalPages > 0 && page >= pagination.totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            style={{ padding: '7px 12px', border: '1px solid #d4d4d8', borderRadius: 6, background: pagination.totalPages > 0 && page >= pagination.totalPages ? '#f4f4f5' : '#fff', cursor: pagination.totalPages > 0 && page >= pagination.totalPages ? 'not-allowed' : 'pointer' }}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
