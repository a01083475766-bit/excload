/**
 * EXCLOAD 관리자 — 사용량 제공·결제 이력
 * 변환·다운로드 차감은 사용자 상세(/akman/users/[id])에서만 조회
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface PointLogRow {
  id: string;
  email: string | null;
  change: number;
  reason: string;
  createdAt: string;
}

export default function PointLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<PointLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [deletingSelected, setDeletingSelected] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/akman/point-history?limit=100');
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        router.push('/');
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || '사용량 이력을 불러오지 못했습니다.');
      }

      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (e) {
      setLogs([]);
      setError(e instanceof Error ? e.message : '사용량 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const visibleLogIds = useMemo(() => logs.map((log) => log.id), [logs]);
  const allVisibleSelected =
    visibleLogIds.length > 0 && visibleLogIds.every((id) => selectedLogIds.includes(id));

  const toggleLogSelection = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAllVisibleLogs = () => {
    if (allVisibleSelected) {
      setSelectedLogIds((prev) => prev.filter((id) => !visibleLogIds.includes(id)));
      return;
    }

    setSelectedLogIds((prev) => [...new Set([...prev, ...visibleLogIds])]);
  };

  const deleteSelectedLogs = async () => {
    const targetIds = selectedLogIds;
    if (targetIds.length === 0) {
      alert('삭제할 사용량 이력을 선택해 주세요.');
      return;
    }

    if (!confirm(`선택한 ${targetIds.length}개의 사용량 이력을 삭제하시겠습니까?\n현재 사용자 포인트 잔액은 변경되지 않습니다.`)) {
      return;
    }

    setDeletingSelected(true);
    try {
      const res = await fetch('/api/akman/point-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        router.push('/');
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || '사용량 이력 삭제에 실패했습니다.');
      }

      setLogs((prev) => prev.filter((log) => !targetIds.includes(log.id)));
      setSelectedLogIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      void fetchLogs();
    } catch (e) {
      alert(e instanceof Error ? e.message : '사용량 이력 삭제에 실패했습니다.');
    } finally {
      setDeletingSelected(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/akman"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            marginRight: '20px',
          }}
        >
          ← 관리자 페이지로 돌아가기
        </Link>
        <Link
          href="/akman/payments"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
          }}
        >
          결제 내역 →
        </Link>
      </div>

      <h1 style={{ marginBottom: '8px' }}>사용량 제공·결제 이력</h1>
      <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px', lineHeight: 1.5 }}>
        월간 지급, 결제, 관리자 조정 등 지급·결제 관련 내역만 표시합니다.
        <br />
        다운로드·텍스트 변환 등 사용 차감은{' '}
        <Link href="/akman" style={{ color: '#0066cc' }}>
          사용자 상세
        </Link>
        에서 조회하세요.
      </p>

      {loading ? (
        <p style={{ color: '#666', marginBottom: '30px' }}>불러오는 중…</p>
      ) : error ? (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            borderRadius: '8px',
            background: '#fff5f5',
            border: '1px solid #fecaca',
            color: '#b91c1c',
          }}
        >
          <p style={{ margin: '0 0 12px' }}>{error}</p>
          <button
            type="button"
            onClick={() => void fetchLogs()}
            style={{
              padding: '8px 14px',
              border: '1px solid #b91c1c',
              borderRadius: '6px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '30px' }}>
          <p style={{ color: '#666', marginBottom: '12px' }}>
            총 {logs.length}건 (지급·결제 기준 최근 100건)
          </p>
          <button
            type="button"
            disabled={selectedLogIds.length === 0 || deletingSelected}
            onClick={() => void deleteSelectedLogs()}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              backgroundColor: selectedLogIds.length === 0 || deletingSelected ? '#e9ecef' : '#dc3545',
              color: selectedLogIds.length === 0 || deletingSelected ? '#6c757d' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedLogIds.length === 0 || deletingSelected ? 'not-allowed' : 'pointer',
            }}
          >
            {deletingSelected ? '선택 삭제 중' : `선택 삭제 (${selectedLogIds.length})`}
          </button>
        </div>
      )}

      {!error && (
        <table
          style={{
            marginTop: '20px',
            borderCollapse: 'collapse',
            width: '100%',
            border: '1px solid #ccc',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'center', width: '44px' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisibleLogs}
                  aria-label="현재 사용량 이력 전체 선택"
                />
              </th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
                이메일
              </th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'right' }}>
                변동
              </th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
                사유
              </th>
              <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
                일시
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    border: '1px solid #ccc',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  불러오는 중…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    border: '1px solid #ccc',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  지급·결제 이력이 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedLogIds.includes(log.id)}
                      onChange={() => toggleLogSelection(log.id)}
                      aria-label={`${log.email || '알 수 없음'} 사용량 이력 선택`}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                    {log.email || '알 수 없음'}
                  </td>
                  <td
                    style={{
                      border: '1px solid #ccc',
                      padding: '12px',
                      textAlign: 'right',
                      color: log.change >= 0 ? 'green' : 'red',
                      fontWeight: 'bold',
                    }}
                  >
                    {log.change >= 0 ? '+' : ''}
                    {log.change.toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>{log.reason}</td>
                  <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                    {new Date(log.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
