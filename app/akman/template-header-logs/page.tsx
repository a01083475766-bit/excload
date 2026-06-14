'use client';

/**
 * 관리자 — 헤더 수집: 사용 횟수 집계(메인) + 미매핑 TOP + 최근 수집 로그
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { TemplateHeaderLogMappedEntry } from '@/app/lib/template-header-log';

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
  maskedEmail: string;
  page: string;
  templateName: string | null;
  courierName: string | null;
  headerCount: number;
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
  const [logGroups, setLogGroups] = useState<HeaderLogGroup[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [unknownLoading, setUnknownLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [usagePageFilter, setUsagePageFilter] = useState('');
  const [usageHeaderSearch, setUsageHeaderSearch] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState('');
  const [source, setSource] = useState('');
  const [courierName, setCourierName] = useState('');
  const [hasUnknown, setHasUnknown] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
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

  const fetchRecentLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        groupByHeaderSet: 'true',
        limit: '20',
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
  }, [dateFrom, dateTo, page, source, courierName, hasUnknown, headerSearch, router]);

  useEffect(() => {
    fetchUsageTop();
    fetchUnknownTop();
    fetchRecentLogs();
  }, [fetchUsageTop, fetchUnknownTop, fetchRecentLogs]);

  const refreshAll = () => {
    fetchUsageTop();
    fetchUnknownTop();
    fetchRecentLogs();
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
        어떤 헤더명이 자주 들어오는지 한눈에 확인할 수 있습니다. 업로드별 상세 로그는 하단
        「최근 수집 로그」에서 동일 헤더 구성끼리 묶어 볼 수 있습니다.
      </p>

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
        <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>
          최근 30일 미매핑 헤더 TOP 100
        </h2>
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
          동일한 헤더 구성은 묶어 표시합니다. 기본 최근 20그룹.
        </p>

        <button
          type="button"
          onClick={() => setShowLogFilters((v) => !v)}
          style={{
            marginBottom: 12,
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
                      </td>
                    </tr>
                    {expandedGroupKey === group.fingerprint && (
                      <tr>
                        <td colSpan={8} style={{ padding: 12, border: '1px solid #e4e4e7', background: '#fafafa' }}>
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
        {log.mappedHeaders.map((m) => (
          <div key={`${log.id}-${m.header}`} style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>{m.header}</span>
            {' → '}
            <span>{m.baseHeader ?? '(미매핑)'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
