'use client';

/**
 * 관리자 — 헤더 수집: 사용 횟수 집계(메인) + 미매핑 TOP + 최근 수집 로그
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import type { TemplateHeaderLogMappedEntry } from '@/app/lib/template-header-log';
import {
  buildHeaderLayoutDownloadFileName,
  buildHeaderLayoutSheetRows,
  parseLayoutHeadersFromLog,
} from '@/app/lib/header-layout-xlsx';

type HeaderUsageTopRow = {
  header: string;
  count: number;
  exampleBaseHeader: string | null;
  isUnmapped: boolean;
  lastSeenAt: string;
  pages: string[];
  lifetimeCount: number | null;
};

type UnknownTopRow = {
  header: string;
  count: number;
};

type TemplateHeaderLogRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  maskedEmail: string;
  page: string;
  templateName: string | null;
  courierName: string | null;
  headerCount: number;
  layoutColumnCount?: number;
  unknownCount: number;
  mappingSuccessRate: number | null;
  headers: string[];
  unknownHeaders: string[];
  mappedHeaders: TemplateHeaderLogMappedEntry[];
  fileSessionId: string | null;
  templateId: string | null;
  source: string;
};

type HeaderLogGroup = {
  fingerprint: string;
  headers: string[];
  repeatCount: number;
  latestCreatedAt: string;
  page: string;
  source: string;
  headerCount: number;
  unknownCount: number;
  mappingSuccessRate: number | null;
  logs: TemplateHeaderLogRow[];
};

const PAGE_LABELS: Record<string, string> = {
  'order-convert': '택배주문변환',
  'logistics-convert': '물류주문변환',
  'invoice-file-convert': '송장파일변환',
};

const SOURCE_LABELS: Record<string, string> = {
  order_upload: '주문파일',
  template_upload: '양식등록',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

function formatMappingRate(rate: number | null | undefined) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 1000) / 10}%`;
}

function formatPages(pages: string[]) {
  if (pages.length === 0) return '—';
  return pages.map((p) => PAGE_LABELS[p] ?? p).join(', ');
}

const SOURCE_UPLOAD_LABELS: Record<string, string> = {
  order_upload: '주문파일',
  template_upload: '택배양식',
};

function displayFileLabel(log: TemplateHeaderLogRow): string {
  if (log.templateName?.trim()) return log.templateName.trim();
  return SOURCE_UPLOAD_LABELS[log.source] ?? log.source;
}

function writeHeaderLayoutWorkbook(headers: string[], fileName: string) {
  const layout = parseLayoutHeadersFromLog(headers);
  if (layout.length === 0 || layout.every((header) => !header.trim())) {
    alert('다운로드할 헤더 구성이 없습니다.');
    return;
  }

  const workbook = XLSX.utils.book_new();
  const sheetRows = buildHeaderLayoutSheetRows(layout, { includeDummyRow: true });
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = layout.map((header) => ({
    wch: Math.min(Math.max((header || '(빈열)').length + 2, 12), 40),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, '헤더');
  XLSX.writeFile(workbook, fileName);
}

function downloadLogHeaderLayoutXlsx(log: TemplateHeaderLogRow) {
  const fileName = buildHeaderLayoutDownloadFileName({
    createdAt: log.createdAt,
    source: log.source,
    courierName: log.courierName,
    templateName: log.templateName,
  });
  writeHeaderLayoutWorkbook(log.headers, fileName);
}

function downloadHeaderRowExcel(group: HeaderLogGroup) {
  const fileName = buildHeaderLayoutDownloadFileName({
    createdAt: group.latestCreatedAt,
    source: group.source,
    courierName: group.logs[0]?.courierName,
    templateName: group.logs[0]?.templateName,
  });
  writeHeaderLayoutWorkbook(group.headers, fileName);
}

const thStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: '1px solid #e4e4e7',
  textAlign: 'left',
};

const tdStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: '1px solid #f4f4f5',
  verticalAlign: 'top',
};

export default function AkmanTemplateHeaderLogsPage() {
  const router = useRouter();
  const [usageTop, setUsageTop] = useState<HeaderUsageTopRow[]>([]);
  const [unknownTop, setUnknownTop] = useState<UnknownTopRow[]>([]);
  const [uploadLogs, setUploadLogs] = useState<TemplateHeaderLogRow[]>([]);
  const [logGroups, setLogGroups] = useState<HeaderLogGroup[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [unknownLoading, setUnknownLoading] = useState(true);
  const [uploadLogsLoading, setUploadLogsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedUploadLogId, setExpandedUploadLogId] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [deletingSelectedGroups, setDeletingSelectedGroups] = useState(false);
  const [resettingUsageTop, setResettingUsageTop] = useState(false);
  const [resettingUnknownTop, setResettingUnknownTop] = useState(false);

  const [usagePageFilter, setUsagePageFilter] = useState('');
  const [usageHeaderSearch, setUsageHeaderSearch] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState('');
  const [source, setSource] = useState('');
  const [courierName, setCourierName] = useState('');
  const [hasUnknown, setHasUnknown] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [uploadLogLimit, setUploadLogLimit] = useState(50);
  const [logLimit, setLogLimit] = useState(20);
  const [showLogFilters, setShowLogFilters] = useState(false);

  const fetchUsageTop = useCallback(async () => {
    setUsageLoading(true);
    try {
      const params = new URLSearchParams({ days: '30', limit: '100' });
      if (usagePageFilter) params.set('page', usagePageFilter);
      if (usageHeaderSearch.trim()) params.set('headerSearch', usageHeaderSearch.trim());

      const response = await fetch(`/api/akman/template-header-logs/usage-top?${params.toString()}`);
      if (response.ok) {
        const json = await response.json();
        setUsageTop(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] usage TOP 조회 실패:', error);
    } finally {
      setUsageLoading(false);
    }
  }, [router, usagePageFilter, usageHeaderSearch]);

  const fetchUnknownTop = useCallback(async () => {
    setUnknownLoading(true);
    try {
      const response = await fetch('/api/akman/template-header-logs/unknown-top?days=30&limit=100');
      if (response.ok) {
        const json = await response.json();
        setUnknownTop(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] unknown TOP 조회 실패:', error);
    } finally {
      setUnknownLoading(false);
    }
  }, [router]);

  const fetchUploadLogs = useCallback(async () => {
    setUploadLogsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(uploadLogLimit),
      });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (page) params.set('page', page);
      if (source) params.set('source', source);
      if (courierName.trim()) params.set('courierName', courierName.trim());
      if (hasUnknown) params.set('hasUnknown', hasUnknown);
      if (headerSearch.trim()) params.set('headerSearch', headerSearch.trim());

      const response = await fetch(`/api/akman/template-header-logs?${params.toString()}`);
      if (response.ok) {
        const json = await response.json();
        setUploadLogs(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] 업로드 로그 조회 실패:', error);
    } finally {
      setUploadLogsLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    page,
    source,
    courierName,
    hasUnknown,
    headerSearch,
    uploadLogLimit,
    router,
  ]);

  const fetchRecentLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        groupByHeaderSet: 'true',
        limit: String(logLimit),
      });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (page) params.set('page', page);
      if (source) params.set('source', source);
      if (courierName.trim()) params.set('courierName', courierName.trim());
      if (hasUnknown) params.set('hasUnknown', hasUnknown);
      if (headerSearch.trim()) params.set('headerSearch', headerSearch.trim());

      const response = await fetch(`/api/akman/template-header-logs?${params.toString()}`);
      if (response.ok) {
        const json = await response.json();
        setLogGroups(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] 최근 로그 조회 실패:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [dateFrom, dateTo, page, source, courierName, hasUnknown, headerSearch, logLimit, router]);

  useEffect(() => {
    fetchUsageTop();
    fetchUnknownTop();
    fetchUploadLogs();
    fetchRecentLogs();
  }, [fetchUsageTop, fetchUnknownTop, fetchUploadLogs, fetchRecentLogs]);

  const refreshAll = () => {
    fetchUsageTop();
    fetchUnknownTop();
    fetchUploadLogs();
    fetchRecentLogs();
  };

  const visibleGroupKeys = useMemo(() => logGroups.map((group) => group.fingerprint), [logGroups]);
  const allVisibleGroupsSelected =
    visibleGroupKeys.length > 0 && visibleGroupKeys.every((key) => selectedGroupKeys.includes(key));

  const selectedLogIds = useMemo(
    () =>
      logGroups
        .filter((group) => selectedGroupKeys.includes(group.fingerprint))
        .flatMap((group) => group.logs.map((log) => log.id)),
    [logGroups, selectedGroupKeys],
  );

  const toggleGroupSelection = (fingerprint: string) => {
    setSelectedGroupKeys((prev) =>
      prev.includes(fingerprint) ? prev.filter((key) => key !== fingerprint) : [...prev, fingerprint],
    );
  };

  const toggleAllVisibleGroups = () => {
    if (allVisibleGroupsSelected) {
      setSelectedGroupKeys((prev) => prev.filter((key) => !visibleGroupKeys.includes(key)));
      return;
    }

    setSelectedGroupKeys((prev) => [...new Set([...prev, ...visibleGroupKeys])]);
  };

  const deleteSelectedGroups = async () => {
    if (selectedLogIds.length === 0) {
      alert('삭제할 수집 로그 그룹을 선택해 주세요.');
      return;
    }

    const ok = confirm(
      `선택한 ${selectedGroupKeys.length}개 그룹의 실제 업로드 로그 ${selectedLogIds.length}건을 삭제하시겠습니까?\n삭제 후 TOP 집계도 함께 갱신됩니다.`,
    );
    if (!ok) return;

    setDeletingSelectedGroups(true);
    try {
      const response = await fetch('/api/akman/template-header-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedLogIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }
      if (!response.ok || !json.ok) {
        throw new Error(json.error || '선택한 수집 로그 삭제에 실패했습니다.');
      }

      setSelectedGroupKeys([]);
      setExpandedGroupKey(null);
      setExpandedLogId(null);
      refreshAll();
    } catch (error) {
      alert(error instanceof Error ? error.message : '선택한 수집 로그 삭제에 실패했습니다.');
    } finally {
      setDeletingSelectedGroups(false);
    }
  };

  const resetUsageTop = async () => {
    const filterText = usagePageFilter || usageHeaderSearch.trim() ? '현재 조회 조건의 ' : '';
    const ok = confirm(
      `${filterText}최근 30일 헤더 사용 집계 원천 로그를 초기화하시겠습니까?\n이 작업은 최근 수집 로그에도 반영됩니다.`,
    );
    if (!ok) return;

    setResettingUsageTop(true);
    try {
      const response = await fetch('/api/akman/template-header-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reset: 'usageTop30',
          page: usagePageFilter || undefined,
          headerSearch: usageHeaderSearch.trim() || undefined,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }
      if (!response.ok || !json.ok) {
        throw new Error(json.error || '헤더 사용 TOP 초기화에 실패했습니다.');
      }

      setSelectedGroupKeys([]);
      refreshAll();
    } catch (error) {
      alert(error instanceof Error ? error.message : '헤더 사용 TOP 초기화에 실패했습니다.');
    } finally {
      setResettingUsageTop(false);
    }
  };

  const resetUnknownTop = async () => {
    const ok = confirm(
      '최근 30일 미매핑 헤더 TOP 원천 로그를 초기화하시겠습니까?\n미매핑 헤더가 포함된 최근 수집 로그도 함께 삭제됩니다.',
    );
    if (!ok) return;

    setResettingUnknownTop(true);
    try {
      const response = await fetch('/api/akman/template-header-logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: 'unknownTop30' }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        router.push('/');
        return;
      }
      if (!response.ok || !json.ok) {
        throw new Error(json.error || '미매핑 헤더 TOP 초기화에 실패했습니다.');
      }

      setSelectedGroupKeys([]);
      refreshAll();
    } catch (error) {
      alert(error instanceof Error ? error.message : '미매핑 헤더 TOP 초기화에 실패했습니다.');
    } finally {
      setResettingUnknownTop(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/akman" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Akman 대시보드
        </Link>
      </div>

      <h1 style={{ marginBottom: 8, fontSize: 22, fontWeight: 700 }}>헤더 수집 로그</h1>
      <p style={{ marginBottom: 20, fontSize: 14, color: '#52525b', lineHeight: 1.6 }}>
        업로드 파일별 실제 헤더 레이아웃을 확인·다운로드할 수 있습니다. 하단에서는 헤더 사용
        통계와 동일 구성 그룹을 함께 볼 수 있습니다.
      </p>

      {/* 0. 업로드 파일별 헤더 레이아웃 */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>업로드 파일별 헤더 레이아웃</h2>
          <button
            type="button"
            onClick={refreshAll}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 16,
            padding: 16,
            background: '#f4f4f5',
            borderRadius: 8,
          }}
        >
          <label style={{ fontSize: 13 }}>
            시작일
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            종료일
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            페이지
            <select
              value={page}
              onChange={(e) => setPage(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            >
              <option value="">전체</option>
              <option value="order-convert">택배주문변환</option>
              <option value="logistics-convert">물류주문변환</option>
              <option value="invoice-file-convert">송장파일변환</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            구분
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            >
              <option value="">전체</option>
              <option value="order_upload">주문파일</option>
              <option value="template_upload">택배양식</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            택배사명
            <input
              type="text"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              placeholder="부분 검색"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            헤더 검색
            <input
              type="text"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="헤더명 포함"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            표시 건수
            <select
              value={uploadLogLimit}
              onChange={(e) => setUploadLogLimit(Number(e.target.value))}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            >
              {[20, 50, 100, 200, 500].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={fetchUploadLogs}
              style={{
                padding: '8px 16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              조회
            </button>
          </div>
        </div>

        {uploadLogsLoading ? (
          <p style={{ color: '#71717a' }}>불러오는 중…</p>
        ) : uploadLogs.length === 0 ? (
          <p style={{ color: '#71717a' }}>조건에 맞는 업로드 기록이 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e4e4e7', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f4f4f5', textAlign: 'left' }}>
                  <th style={thStyle}>등록일</th>
                  <th style={thStyle}>사용자</th>
                  <th style={thStyle}>구분</th>
                  <th style={thStyle}>택배사</th>
                  <th style={thStyle}>양식/파일명</th>
                  <th style={{ ...thStyle, width: 72 }}>헤더 수</th>
                  <th style={{ ...thStyle, width: 140 }}>보기</th>
                  <th style={{ ...thStyle, width: 100 }}>다운로드</th>
                </tr>
              </thead>
              <tbody>
                {uploadLogs.map((log) => (
                  <Fragment key={log.id}>
                    <tr>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(log.createdAt)}</td>
                      <td style={tdStyle}>
                        {log.userId ? (
                          <Link
                            href={`/akman/users/${encodeURIComponent(log.userId)}`}
                            style={{ color: '#2563eb', textDecoration: 'none' }}
                          >
                            {log.maskedEmail}
                          </Link>
                        ) : (
                          log.maskedEmail
                        )}
                      </td>
                      <td style={tdStyle}>{SOURCE_UPLOAD_LABELS[log.source] ?? log.source}</td>
                      <td style={tdStyle}>{log.courierName?.trim() || '—'}</td>
                      <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{displayFileLabel(log)}</td>
                      <td style={tdStyle}>{log.headerCount}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedUploadLogId((prev) => (prev === log.id ? null : log.id))
                          }
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            border: '1px solid #a1a1aa',
                            borderRadius: 4,
                            background: '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          {expandedUploadLogId === log.id ? '닫기' : '보기'}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => downloadLogHeaderLayoutXlsx(log)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 12,
                            border: '1px solid #93c5fd',
                            borderRadius: 4,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                          }}
                        >
                          XLSX
                        </button>
                      </td>
                    </tr>
                    {expandedUploadLogId === log.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: 12, background: '#fafafa', borderBottom: '1px solid #e4e4e7' }}>
                          <HeaderLayoutDetail log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: 8, fontSize: 12, color: '#71717a' }}>
          XLSX는 헤더 1행과 형식 힌트용 더미 1행만 포함합니다. 주문 데이터·개인정보는 저장·다운로드하지
          않습니다.
        </p>
      </section>

      {/* 1. 헤더 사용 TOP */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            최근 30일 헤더 사용 횟수 TOP 100
          </h2>
          <button
            type="button"
            onClick={refreshAll}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
          <button
            type="button"
            disabled={resettingUsageTop}
            onClick={() => void resetUsageTop()}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #fecaca',
              borderRadius: 6,
              background: resettingUsageTop ? '#f4f4f5' : '#fff',
              color: '#b91c1c',
              cursor: resettingUsageTop ? 'not-allowed' : 'pointer',
            }}
          >
            {resettingUsageTop ? '초기화 중' : '초기화하기'}
          </button>
        </div>

        <div
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
            페이지
            <select
              value={usagePageFilter}
              onChange={(e) => setUsagePageFilter(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            >
              <option value="">전체</option>
              <option value="order-convert">택배주문변환</option>
              <option value="logistics-convert">물류주문변환</option>
              <option value="invoice-file-convert">송장파일변환</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            헤더 검색
            <input
              type="text"
              value={usageHeaderSearch}
              onChange={(e) => setUsageHeaderSearch(e.target.value)}
              placeholder="헤더명 포함"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={fetchUsageTop}
              style={{
                padding: '8px 16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              조회
            </button>
          </div>
        </div>

        {usageLoading ? (
          <p style={{ color: '#71717a' }}>집계 중…</p>
        ) : usageTop.length === 0 ? (
          <p style={{ color: '#71717a' }}>집계할 헤더가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e4e4e7', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#eff6ff', textAlign: 'left' }}>
                  <th style={{ ...thStyle, width: 48 }}>#</th>
                  <th style={thStyle}>헤더명</th>
                  <th style={{ ...thStyle, width: 90 }}>사용 횟수</th>
                  <th style={{ ...thStyle, width: 90 }}>누적(사전)</th>
                  <th style={thStyle}>매핑 기준헤더</th>
                  <th style={{ ...thStyle, width: 80 }}>미매핑</th>
                  <th style={{ ...thStyle, width: 140 }}>최근 사용일</th>
                  <th style={thStyle}>사용 페이지</th>
                </tr>
              </thead>
              <tbody>
                {usageTop.map((row, index) => (
                  <tr key={row.header}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={{ ...tdStyle, wordBreak: 'break-all', fontWeight: 500 }}>{row.header}</td>
                    <td style={tdStyle}>{row.count}</td>
                    <td style={{ ...tdStyle, color: '#71717a' }}>
                      {row.lifetimeCount != null ? row.lifetimeCount : '—'}
                    </td>
                    <td style={tdStyle}>{row.exampleBaseHeader ?? '(미매핑)'}</td>
                    <td style={tdStyle}>
                      {row.isUnmapped ? (
                        <span style={{ color: '#b45309', fontWeight: 600 }}>예</span>
                      ) : (
                        <span style={{ color: '#16a34a' }}>아니오</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.lastSeenAt)}</td>
                    <td style={tdStyle}>{formatPages(row.pages)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: 8, fontSize: 12, color: '#71717a' }}>
          사용 횟수는 최근 30일 업로드 로그 기준입니다. 누적(사전)은 HeaderUsageCount 테이블 값입니다.
        </p>
      </section>

      {/* 2. 미매핑 TOP */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            최근 30일 미매핑 헤더 TOP 100
          </h2>
          <button
            type="button"
            disabled={resettingUnknownTop}
            onClick={() => void resetUnknownTop()}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #fecaca',
              borderRadius: 6,
              background: resettingUnknownTop ? '#f4f4f5' : '#fff',
              color: '#b91c1c',
              cursor: resettingUnknownTop ? 'not-allowed' : 'pointer',
            }}
          >
            {resettingUnknownTop ? '초기화 중' : '초기화하기'}
          </button>
        </div>
        {unknownLoading ? (
          <p style={{ color: '#71717a' }}>집계 중…</p>
        ) : unknownTop.length === 0 ? (
          <p style={{ color: '#71717a' }}>집계할 미매핑 헤더가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e4e4e7', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fef3c7', textAlign: 'left' }}>
                  <th style={{ ...thStyle, width: 56 }}>#</th>
                  <th style={thStyle}>헤더명</th>
                  <th style={{ ...thStyle, width: 100 }}>등장 횟수</th>
                </tr>
              </thead>
              <tbody>
                {unknownTop.map((row, index) => (
                  <tr key={row.header}>
                    <td style={tdStyle}>{index + 1}</td>
                    <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{row.header}</td>
                    <td style={tdStyle}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. 최근 수집 로그 (grouped) */}
      <section>
        <h2 style={{ marginBottom: 8, fontSize: 18, fontWeight: 600 }}>최근 수집 로그</h2>
        <p style={{ marginBottom: 12, fontSize: 13, color: '#71717a' }}>
          동일한 헤더 구성은 묶어 표시합니다. 표시 개수는 20~500그룹까지 선택할 수 있습니다.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowLogFilters((v) => !v)}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {showLogFilters ? '상세 필터 닫기' : '상세 필터 열기'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            표시 그룹
            <select
              value={logLimit}
              onChange={(e) => setLogLimit(Number(e.target.value))}
              style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6 }}
            >
              {[20, 100, 200, 500].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={selectedLogIds.length === 0 || deletingSelectedGroups}
            onClick={() => void deleteSelectedGroups()}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              border: '1px solid #fecaca',
              borderRadius: 6,
              background: selectedLogIds.length === 0 || deletingSelectedGroups ? '#f4f4f5' : '#dc2626',
              color: selectedLogIds.length === 0 || deletingSelectedGroups ? '#71717a' : '#fff',
              cursor: selectedLogIds.length === 0 || deletingSelectedGroups ? 'not-allowed' : 'pointer',
            }}
          >
            {deletingSelectedGroups ? '선택 삭제 중' : `선택 삭제 (${selectedLogIds.length})`}
          </button>
        </div>

        {showLogFilters && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 20,
              padding: 16,
              background: '#f4f4f5',
              borderRadius: 8,
            }}
          >
            <label style={{ fontSize: 13 }}>
              시작일
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              종료일
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              페이지
              <select
                value={page}
                onChange={(e) => setPage(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              >
                <option value="">전체</option>
                <option value="order-convert">택배주문변환</option>
                <option value="logistics-convert">물류주문변환</option>
                <option value="invoice-file-convert">송장파일변환</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              수집 유형
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              >
                <option value="">전체</option>
                <option value="order_upload">주문파일</option>
                <option value="template_upload">양식등록</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              택배사명
              <input
                type="text"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="부분 검색"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              미매핑 헤더
              <select
                value={hasUnknown}
                onChange={(e) => setHasUnknown(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              >
                <option value="">전체</option>
                <option value="true">있음</option>
                <option value="false">없음</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              헤더 검색
              <input
                type="text"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder="헤더명 포함"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={fetchRecentLogs}
                style={{
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                조회
              </button>
            </div>
          </div>
        )}

        {logsLoading ? (
          <p>불러오는 중…</p>
        ) : logGroups.length === 0 ? (
          <p style={{ color: '#71717a' }}>조건에 맞는 로그가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#e4e4e7', textAlign: 'left' }}>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8', textAlign: 'center', width: 44 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleGroupsSelected}
                      onChange={toggleAllVisibleGroups}
                      aria-label="현재 수집 로그 그룹 전체 선택"
                    />
                  </th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>최근 등록일</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>반복</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>유형</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>페이지</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>헤더 수</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>미매핑</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>매핑률</th>
                  <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {logGroups.map((group) => (
                  <Fragment key={group.fingerprint}>
                    <tr>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedGroupKeys.includes(group.fingerprint)}
                          onChange={() => toggleGroupSelection(group.fingerprint)}
                          aria-label={`${PAGE_LABELS[group.page] ?? group.page} 수집 로그 그룹 선택`}
                        />
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7', whiteSpace: 'nowrap' }}>
                        {formatDate(group.latestCreatedAt)}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                        {group.repeatCount > 1 ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color: '#2563eb',
                              background: '#eff6ff',
                              padding: '2px 8px',
                              borderRadius: 999,
                            }}
                          >
                            ×{group.repeatCount}
                          </span>
                        ) : (
                          '1회'
                        )}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                        {SOURCE_LABELS[group.source] ?? group.source}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                        {PAGE_LABELS[group.page] ?? group.page}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>{group.headerCount}</td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>{group.unknownCount}</td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                        {formatMappingRate(group.mappingSuccessRate)}
                      </td>
                      <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroupKey((prev) =>
                                prev === group.fingerprint ? null : group.fingerprint,
                              )
                            }
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              border: '1px solid #a1a1aa',
                              borderRadius: 4,
                              background: '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            {expandedGroupKey === group.fingerprint ? '닫기' : '헤더·업로드 보기'}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadHeaderRowExcel(group)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              border: '1px solid #93c5fd',
                              borderRadius: 4,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              cursor: 'pointer',
                            }}
                          >
                            헤더 엑셀 다운로드
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedGroupKey === group.fingerprint && (
                      <tr>
                        <td colSpan={9} style={{ padding: 12, border: '1px solid #e4e4e7', background: '#fafafa' }}>
                          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                            헤더 구성 ({group.headerCount}개)
                          </p>
                          <p style={{ margin: '0 0 16px', wordBreak: 'break-all', lineHeight: 1.6 }}>
                            {group.headers.join(' · ')}
                          </p>

                          {group.repeatCount > 1 && (
                            <>
                              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                                업로드 내역 ({group.repeatCount}건)
                              </p>
                              <div style={{ marginBottom: 16 }}>
                                {group.logs.map((log) => (
                                  <div
                                    key={log.id}
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 8,
                                      alignItems: 'center',
                                      padding: '6px 0',
                                      borderBottom: '1px solid #eee',
                                      fontSize: 12,
                                    }}
                                  >
                                    <span style={{ whiteSpace: 'nowrap' }}>{formatDate(log.createdAt)}</span>
                                    <span>{log.maskedEmail}</span>
                                    <button
                                      type="button"
                                      onClick={() => downloadLogHeaderLayoutXlsx(log)}
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: 11,
                                        border: '1px solid #93c5fd',
                                        borderRadius: 4,
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      XLSX
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedLogId((prev) => (prev === log.id ? null : log.id))
                                      }
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: 11,
                                        border: '1px solid #ccc',
                                        borderRadius: 4,
                                        background: '#fff',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {expandedLogId === log.id ? '매핑 닫기' : '매핑 보기'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {group.repeatCount === 1 && group.logs[0] && (
                            <LogMappingDetail log={group.logs[0]} />
                          )}

                          {group.repeatCount > 1 &&
                            expandedLogId &&
                            group.logs.find((l) => l.id === expandedLogId) && (
                              <LogMappingDetail log={group.logs.find((l) => l.id === expandedLogId)!} />
                            )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function HeaderLayoutDetail({ log }: { log: TemplateHeaderLogRow }) {
  const layoutHeaders = parseLayoutHeadersFromLog(log.headers);
  const emptyColumnCount = layoutHeaders.filter((header) => !header.trim()).length;

  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
        헤더 목록 ({log.headerCount}개
        {layoutHeaders.length !== log.headerCount
          ? `, 열 ${layoutHeaders.length}개`
          : ''}
        {emptyColumnCount > 0 ? `, 빈 열 ${emptyColumnCount}개` : ''})
      </p>
      <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.7 }}>
        {layoutHeaders.map((header, index) => (
          <li key={`${log.id}-col-${index}`} style={{ wordBreak: 'break-all' }}>
            {header.trim() ? header : <span style={{ color: '#a1a1aa' }}>(빈 열)</span>}
          </li>
        ))}
      </ol>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#71717a' }}>
        페이지: {PAGE_LABELS[log.page] ?? log.page} · 등록: {formatDate(log.createdAt)}
      </p>
      {log.unknownCount > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309' }}>
          미매핑 헤더: {Array.isArray(log.unknownHeaders) ? log.unknownHeaders.join(' · ') : '—'}
        </p>
      )}
      <LogMappingDetail log={log} />
    </div>
  );
}

function LogMappingDetail({ log }: { log: TemplateHeaderLogRow }) {
  return (
    <div style={{ fontSize: 12 }}>
      {log.unknownCount > 0 && (
        <>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#b45309' }}>
            미매핑 헤더 ({log.unknownCount}개)
          </p>
          <p style={{ margin: '0 0 12px', color: '#b45309' }}>{log.unknownHeaders.join(' · ')}</p>
        </>
      )}
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>매핑 결과</p>
      <div style={{ maxHeight: 200, overflow: 'auto' }}>
        {log.mappedHeaders.map((m, index) => (
          <div key={`${log.id}-map-${index}`} style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>{m.header}</span>
            {' → '}
            <span>{m.baseHeader ?? '(미매핑)'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
