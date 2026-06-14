'use client';

/**
 * 관리자 — 신규 헤더 발견(HeaderDictionary) + 사용 횟수(HeaderUsageCount)
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type DictionaryRow = {
  id: string;
  header: string;
  firstSeenAt: string;
  page: string;
  source: string;
  exampleBaseHeader: string | null;
  usageCount: number;
  lastSeenAt: string | null;
};

type UsageRow = {
  id: string;
  header: string;
  count: number;
  lastSeenAt: string;
  firstSeenAt: string;
  page: string;
  source: string;
  exampleBaseHeader: string | null;
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

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

export default function AkmanHeaderDictionaryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'new' | 'usage'>('new');
  const [dictionaryRows, setDictionaryRows] = useState<DictionaryRow[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState('');
  const [source, setSource] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');

  const fetchDictionary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (page) params.set('page', page);
      if (source) params.set('source', source);
      if (headerSearch.trim()) params.set('headerSearch', headerSearch.trim());

      const response = await fetch(`/api/akman/header-dictionary?${params.toString()}`);
      if (response.ok) {
        const json = await response.json();
        setDictionaryRows(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[header-dictionary admin] 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page, source, headerSearch, router]);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (headerSearch.trim()) params.set('headerSearch', headerSearch.trim());

      const response = await fetch(`/api/akman/header-usage?${params.toString()}`);
      if (response.ok) {
        const json = await response.json();
        setUsageRows(json.data ?? []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[header-usage admin] 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [headerSearch, router]);

  const fetchCurrent = useCallback(() => {
    if (tab === 'new') {
      void fetchDictionary();
    } else {
      void fetchUsage();
    }
  }, [tab, fetchDictionary, fetchUsage]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  const thStyle = {
    padding: 8,
    border: '1px solid #d4d4d8',
  } as const;

  const tdStyle = {
    padding: 8,
    border: '1px solid #e4e4e7',
  } as const;

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/akman" style={{ color: '#2563eb', fontSize: 14 }}>
          ← Akman 대시보드
        </Link>
      </div>

      <h1 style={{ marginBottom: 8, fontSize: 22, fontWeight: 700 }}>헤더 사전</h1>
      <p style={{ marginBottom: 20, fontSize: 14, color: '#52525b' }}>
        업로드 시 처음 발견된 헤더만 HeaderDictionary에 등록하고, 모든 업로드에서 사용 횟수를
        집계합니다. TemplateHeaderLog(업로드별 로그)는 기존과 같이 유지됩니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTab('new')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: tab === 'new' ? '2px solid #2563eb' : '1px solid #d1d5db',
            background: tab === 'new' ? '#eff6ff' : '#fff',
            cursor: 'pointer',
            fontWeight: tab === 'new' ? 600 : 400,
          }}
        >
          신규 헤더 발견
        </button>
        <button
          type="button"
          onClick={() => setTab('usage')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: tab === 'usage' ? '2px solid #2563eb' : '1px solid #d1d5db',
            background: tab === 'usage' ? '#eff6ff' : '#fff',
            cursor: 'pointer',
            fontWeight: tab === 'usage' ? 600 : 400,
          }}
        >
          헤더 사용 횟수
        </button>
      </div>

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
        {tab === 'new' && (
          <>
            <label style={{ fontSize: 13 }}>
              최초 발견 시작일
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              최초 발견 종료일
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
          </>
        )}
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
            onClick={fetchCurrent}
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

      {loading ? (
        <p>불러오는 중…</p>
      ) : tab === 'new' ? (
        dictionaryRows.length === 0 ? (
          <p style={{ color: '#71717a' }}>조건에 맞는 신규 헤더가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#e4e4e7', textAlign: 'left' }}>
                  <th style={thStyle}>최초 발견</th>
                  <th style={thStyle}>헤더명</th>
                  <th style={thStyle}>예시 기준헤더</th>
                  <th style={thStyle}>페이지</th>
                  <th style={thStyle}>유형</th>
                  <th style={thStyle}>누적 사용</th>
                  <th style={thStyle}>최근 사용</th>
                </tr>
              </thead>
              <tbody>
                {dictionaryRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.firstSeenAt)}</td>
                    <td style={{ ...tdStyle, wordBreak: 'break-all', fontWeight: 500 }}>{row.header}</td>
                    <td style={tdStyle}>{row.exampleBaseHeader || '—'}</td>
                    <td style={tdStyle}>{PAGE_LABELS[row.page] ?? row.page}</td>
                    <td style={tdStyle}>{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td style={tdStyle}>{row.usageCount}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : usageRows.length === 0 ? (
        <p style={{ color: '#71717a' }}>조건에 맞는 사용량 데이터가 없습니다.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#e4e4e7', textAlign: 'left' }}>
                <th style={thStyle}>순위</th>
                <th style={thStyle}>헤더명</th>
                <th style={thStyle}>사용 횟수</th>
                <th style={thStyle}>예시 기준헤더</th>
                <th style={thStyle}>최초 발견</th>
                <th style={thStyle}>최근 사용</th>
                <th style={thStyle}>페이지</th>
                <th style={thStyle}>유형</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map((row, index) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{index + 1}</td>
                  <td style={{ ...tdStyle, wordBreak: 'break-all', fontWeight: 500 }}>{row.header}</td>
                  <td style={tdStyle}>{row.count}</td>
                  <td style={tdStyle}>{row.exampleBaseHeader || '—'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.firstSeenAt)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(row.lastSeenAt)}</td>
                  <td style={tdStyle}>{PAGE_LABELS[row.page] ?? row.page}</td>
                  <td style={tdStyle}>{SOURCE_LABELS[row.source] ?? row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
