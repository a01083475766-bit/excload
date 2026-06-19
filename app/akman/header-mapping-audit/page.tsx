'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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

const STATUS_LABELS: Record<string, string> = {
  AUTO_MATCHED: '자동 매핑',
  LOW_CONFIDENCE: '낮은 신뢰도',
  UNMAPPED: '미매핑',
  NEEDS_REVIEW: '검토 필요',
  CONFIRMED: '확인됨',
  IGNORED: '무시됨',
};

const METHOD_LABELS: Record<string, string> = {
  BASE_HEADER: '기준헤더',
  DB_ALIAS: 'DB 별칭',
  STATIC_ALIAS: '고정 별칭',
  AI: 'AI 매핑',
  REFINED: '정제됨',
  UNMAPPED: '미매핑',
};

const SAMPLE_VALUE_TYPE_LABELS: Record<string, string> = {
  DATE: '날짜',
  MONEY: '금액',
  PHONE: '전화번호',
  ADDRESS: '주소',
  NAME: '이름',
  MESSAGE: '메시지',
  CODE: '코드',
  STATUS: '상태',
  TEXT: '텍스트',
  EMPTY: '빈 값',
};

const ADMIN_STATUS_LABELS: Record<string, string> = {
  PENDING: '대기',
  CONFIRMED: '확인',
  CHANGED: '변경됨',
  IGNORED: '무시',
  HOLD: '보류',
};

const SOURCE_LABELS: Record<string, string> = {
  excel: '엑셀',
  text: '텍스트',
};

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

const excelThStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d4d4d8',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  background: '#f8fafc',
  fontWeight: 700,
};

const excelTdStyle: React.CSSProperties = {
  padding: '5px 10px',
  border: '1px solid #e4e4e7',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const clippedExcelTdStyle: React.CSSProperties = {
  ...excelTdStyle,
  maxWidth: 260,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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

function labelFor(labels: Record<string, string>, value: string | null | undefined, emptyLabel = '전체') {
  if (!value) return emptyLabel;
  return labels[value] ?? value;
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
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
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

  const deleteAuditLog = async (log: AuditLog) => {
    const ok = confirm(
      '이 헤더 매핑 검토 로그 묶음을 삭제하시겠습니까?\n삭제하면 이 묶음 안의 상세 헤더 기록도 함께 삭제됩니다.',
    );
    if (!ok) return;

    setActionError('');
    setDeletingLogId(log.id);
    try {
      const response = await fetch('/api/akman/header-mapping-audit', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: log.id }),
      });

      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || '헤더 매핑 검토 로그 삭제에 실패했습니다.');
      }

      setLogs((prev) => prev.filter((item) => item.id !== log.id));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        totalPages: Math.max(0, Math.ceil(Math.max(0, prev.total - 1) / prev.pageSize)),
      }));
      if (expandedLogId === log.id) {
        setExpandedLogId(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '헤더 매핑 검토 로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingLogId(null);
    }
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
          매핑 상태
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{labelFor(STATUS_LABELS, option)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          매핑 방식
          <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {METHOD_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{labelFor(METHOD_LABELS, option)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          샘플 값 종류
          <select value={sampleValueType} onChange={(e) => { setSampleValueType(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {TYPE_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{labelFor(SAMPLE_VALUE_TYPE_LABELS, option)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          관리자 검토 상태
          <select value={adminStatus} onChange={(e) => { setAdminStatus(e.target.value); setPage(1); }} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}>
            {ADMIN_STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{labelFor(ADMIN_STATUS_LABELS, option)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          원본 헤더
          <input value={originalHeader} onChange={(e) => { setOriginalHeader(e.target.value); setPage(1); }} placeholder="원본 헤더 검색" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          기준헤더
          <input value={baseHeader} onChange={(e) => { setBaseHeader(e.target.value); setPage(1); }} placeholder="기준헤더 검색" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          출처
          <input value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} placeholder="엑셀 등" style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
        </label>
        <label style={{ fontSize: 13 }}>
          한 페이지 표시 수
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
                <th style={thStyle}>출처</th>
                <th style={thStyle}>전체 헤더 수</th>
                <th style={thStyle}>자동 매핑</th>
                <th style={thStyle}>미매핑</th>
                <th style={thStyle}>낮은 신뢰도</th>
                <th style={thStyle}>검토 필요</th>
                <th style={thStyle}>마스킹 샘플</th>
                <th style={thStyle}>상세</th>
                <th style={thStyle}>삭제</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const expanded = expandedLogId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr>
                      <td style={tdStyle}>{formatDate(log.createdAt)}</td>
                      <td style={tdStyle}>{labelFor(SOURCE_LABELS, log.source, '—')}</td>
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
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          disabled={deletingLogId === log.id}
                          onClick={() => deleteAuditLog(log)}
                          style={{
                            padding: '4px 8px',
                            border: '1px solid #fecaca',
                            borderRadius: 6,
                            background: deletingLogId === log.id ? '#fef2f2' : '#fff',
                            color: '#991b1b',
                            cursor: deletingLogId === log.id ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {deletingLogId === log.id ? '삭제 중' : '삭제'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, borderBottom: '1px solid #e4e4e7', background: '#fff' }}>
                          <div style={{ overflowX: 'auto', padding: 12 }}>
                            <table style={{ minWidth: 1320, borderCollapse: 'collapse', fontSize: 12, background: '#fff' }}>
                              <thead>
                                <tr>
                                  <th style={excelThStyle}>DB 별칭</th>
                                  <th style={excelThStyle}>원본 헤더</th>
                                  <th style={excelThStyle}>시스템 기준헤더</th>
                                  <th style={excelThStyle}>적용 기준헤더</th>
                                  <th style={excelThStyle}>매핑 상태</th>
                                  <th style={excelThStyle}>매핑 방식</th>
                                  <th style={excelThStyle}>샘플 값 종류</th>
                                  <th style={excelThStyle}>마스킹 샘플</th>
                                  <th style={excelThStyle}>샘플 수</th>
                                  <th style={excelThStyle}>관리자 검토 상태</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.entries.length === 0 ? (
                                  <tr>
                                    <td style={excelTdStyle} colSpan={10}>표시할 엔트리가 없습니다.</td>
                                  </tr>
                                ) : (
                                  log.entries.map((entry) => {
                                    const maskedSamples = asMaskedSamples(entry.maskedSamples).join(', ');
                                    return (
                                      <tr key={entry.id}>
                                        <td style={excelTdStyle}>
                                          <span style={apiAliasStatusStyle(entry.aliasStatus)}>
                                            {apiAliasStatusLabel(entry)}
                                          </span>
                                        </td>
                                        <td style={clippedExcelTdStyle} title={entry.originalHeader}>{entry.originalHeader}</td>
                                        <td style={clippedExcelTdStyle} title={entry.baseHeader ?? '(미매핑)'}>
                                          {entry.baseHeader ?? '(미매핑)'}
                                        </td>
                                        <td style={clippedExcelTdStyle} title={entry.effectiveBaseHeader ?? '(없음)'}>
                                          {entry.effectiveBaseHeader ?? '(없음)'}
                                        </td>
                                        <td style={excelTdStyle}>{labelFor(STATUS_LABELS, entry.status, '—')}</td>
                                        <td style={excelTdStyle}>{labelFor(METHOD_LABELS, entry.method, '—')}</td>
                                        <td style={excelTdStyle}>{labelFor(SAMPLE_VALUE_TYPE_LABELS, entry.sampleValueType, '—')}</td>
                                        <td style={clippedExcelTdStyle} title={maskedSamples || '—'}>
                                          {maskedSamples || '—'}
                                        </td>
                                        <td style={excelTdStyle}>{entry.sampleCount}</td>
                                        <td style={excelTdStyle}>
                                          <span style={adminStatusStyle(entry.adminStatus)}>
                                            {labelFor(ADMIN_STATUS_LABELS, entry.adminStatus || 'PENDING', '대기')}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
