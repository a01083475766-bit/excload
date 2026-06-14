'use client';

/**
 * 관리자 — 업로드 양식·주문파일 1행 헤더 수집 로그 (PII 미저장)
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { TemplateHeaderLogMappedEntry } from '@/app/lib/template-header-log';

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

type UnknownTopRow = {
  header: string;
  count: number;
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

export default function AkmanTemplateHeaderLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<TemplateHeaderLogRow[]>([]);
  const [unknownTop, setUnknownTop] = useState<UnknownTopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState('');
  const [source, setSource] = useState('');
  const [courierName, setCourierName] = useState('');
  const [hasUnknown, setHasUnknown] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');

  const fetchUnknownTop = useCallback(async () => {
    setTopLoading(true);
    try {
      const response = await fetch('/api/akman/template-header-logs/unknown-top?days=30&limit=100');
      if (response.ok) {
        const json = await response.json();
        setUnknownTop(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] TOP 조회 실패:', error);
    } finally {
      setTopLoading(false);
    }
  }, [router]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
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
        setLogs(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[template-header-logs admin] 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, source, courierName, hasUnknown, headerSearch, router]);

  useEffect(() => {
    fetchUnknownTop();
    fetchLogs();
  }, [fetchUnknownTop, fetchLogs]);

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/akman" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Akman 대시보드
        </Link>
      </div>

      <h1 style={{ marginBottom: 8, fontSize: 22, fontWeight: 700 }}>헤더 수집 로그</h1>
      <p style={{ marginBottom: 20, fontSize: 14, color: '#52525b' }}>
        주문파일·업로드 양식 등록 시 엑셀 1행 헤더만 저장합니다. 2행 이후 주문 데이터·개인정보·원본
        파일은 포함되지 않습니다.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>
          최근 30일 미매핑 헤더 TOP 100
        </h2>
        {topLoading ? (
          <p style={{ color: '#71717a' }}>집계 중…</p>
        ) : unknownTop.length === 0 ? (
          <p style={{ color: '#71717a' }}>집계할 미매핑 헤더가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e4e4e7', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fef3c7', textAlign: 'left' }}>
                  <th style={{ padding: 8, borderBottom: '1px solid #e4e4e7', width: 56 }}>#</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e4e4e7' }}>헤더명</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e4e4e7', width: 100 }}>등장 횟수</th>
                </tr>
              </thead>
              <tbody>
                {unknownTop.map((row, index) => (
                  <tr key={row.header}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f4f4f5' }}>{index + 1}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f4f4f5', wordBreak: 'break-all' }}>
                      {row.header}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f4f4f5' }}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h2 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>수집 로그 목록</h2>

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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={fetchLogs}
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
          <button
            type="button"
            onClick={fetchUnknownTop}
            style={{
              padding: '8px 16px',
              background: '#fff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            TOP 새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <p>불러오는 중…</p>
      ) : logs.length === 0 ? (
        <p style={{ color: '#71717a' }}>조건에 맞는 로그가 없습니다.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#e4e4e7', textAlign: 'left' }}>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>등록일</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>사용자</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>유형</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>페이지</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>양식명</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>택배사명</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>헤더 수</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>미매핑</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>매핑률</th>
                <th style={{ padding: 8, border: '1px solid #d4d4d8' }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7', whiteSpace: 'nowrap' }}>
                      {formatDate(log.createdAt)}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>{log.maskedEmail}</td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      {SOURCE_LABELS[log.source] ?? log.source}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      {PAGE_LABELS[log.page] ?? log.page}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      {log.templateName || '—'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      {log.courierName || '—'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>{log.headerCount}</td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>{log.unknownCount}</td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      {formatMappingRate(log.mappingSuccessRate)}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #e4e4e7' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId((prev) => (prev === log.id ? null : log.id))
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
                        {expandedId === log.id ? '닫기' : '전체 헤더 보기'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 12, border: '1px solid #e4e4e7', background: '#fafafa' }}>
                        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>전체 헤더 ({log.headerCount}개)</p>
                        <p style={{ margin: '0 0 12px', wordBreak: 'break-all', lineHeight: 1.6 }}>
                          {log.headers.join(' · ')}
                        </p>
                        {log.unknownCount > 0 && (
                          <>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#b45309' }}>
                              미매핑 헤더 ({log.unknownCount}개)
                            </p>
                            <p style={{ margin: '0 0 12px', color: '#b45309' }}>
                              {log.unknownHeaders.join(' · ')}
                            </p>
                          </>
                        )}
                        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>매핑 결과</p>
                        <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                          {log.mappedHeaders.map((m) => (
                            <div key={`${log.id}-${m.header}`} style={{ marginBottom: 4 }}>
                              <span style={{ fontWeight: 500 }}>{m.header}</span>
                              {' → '}
                              <span>{m.baseHeader ?? '(미매핑)'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
