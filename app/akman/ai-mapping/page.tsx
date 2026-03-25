/**
 * EXCLOAD 관리자 페이지 - AI Header Mapping Log
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * 보안 규칙:
 * 1. 로그인된 사용자만 접근 가능
 * 2. session.user.email === process.env.ADMIN_EMAIL 인 경우만 접근 허용
 * 3. 관리자 이메일이 아니면 "/" 로 redirect
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AiHeaderMappingLog {
  id: string;
  originalHeader: string;
  aiMappedHeader: string;
  baseHeader: string;
  sourceType: string;
  createdAt: string;
}

interface HeaderAlias {
  id: string;
  alias: string;
  baseHeader: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AkmanAiMappingPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AiHeaderMappingLog[]>([]);
  const [aliases, setAliases] = useState<HeaderAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchAlias, setSearchAlias] = useState('');

  // AI 매핑 로그 조회
  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/akman/ai-mapping');
      if (response.ok) {
        const data = await response.json();
        setLogs(data || []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[Akman AI Mapping Page] 로그 조회 실패:', error);
    }
  };

  // HeaderAlias 목록 조회
  const fetchAliases = async () => {
    try {
      const url = searchAlias 
        ? `/api/akman/header-alias?alias=${encodeURIComponent(searchAlias)}`
        : '/api/akman/header-alias';
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setAliases(result.data || []);
      } else if (response.status === 401 || response.status === 403) {
        router.push('/');
      }
    } catch (error) {
      console.error('[Akman AI Mapping Page] 별칭 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchAliases();
  }, [router]);

  useEffect(() => {
    if (!loading) {
      fetchAliases();
    }
  }, [searchAlias]);

  // Alias 추가 버튼 핸들러
  const handleAddAlias = async (log: AiHeaderMappingLog) => {
    try {
      const response = await fetch('/api/akman/header-alias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alias: log.originalHeader,
          baseHeader: log.aiMappedHeader,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Alias 저장 실패');
      }

      const result = await response.json();
      alert(`✅ Alias가 성공적으로 추가되었습니다.\n\n${log.originalHeader} → ${log.aiMappedHeader}`);
      
      // 성공 시 별칭 목록 새로고침
      fetchAliases();
    } catch (error: any) {
      console.error('[Akman AI Mapping Page] Alias 추가 실패:', error);
      alert(`❌ Alias 추가 실패: ${error.message || '알 수 없는 오류'}`);
    }
  };

  // 로그 삭제 핸들러
  const handleDeleteLog = async (logId: string) => {
    if (!confirm('이 로그를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch('/api/akman/ai-mapping', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: logId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '로그 삭제 실패');
      }

      // 성공 시 로그 목록 새로고침
      fetchLogs();
    } catch (error: any) {
      console.error('[Akman AI Mapping Page] 로그 삭제 실패:', error);
      alert(`❌ 로그 삭제 실패: ${error.message || '알 수 없는 오류'}`);
    }
  };

  // 별칭이 이미 추가되었는지 확인하는 함수
  const isAliasAdded = (originalHeader: string, baseHeader: string): boolean => {
    return aliases.some(
      alias => alias.alias === originalHeader && alias.baseHeader === baseHeader
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
        <Link
          href="/akman"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          ← 관리자 홈
        </Link>
      </div>

      <h1 style={{ marginBottom: '20px' }}>AI Header Mapping Log</h1>

      <p style={{ color: '#666', marginBottom: '30px' }}>
        총 {logs.length}개의 매핑 로그
      </p>

      {/* 별칭 조회 섹션 */}
      <div style={{ marginBottom: '40px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h2 style={{ marginBottom: '15px', fontSize: '18px' }}>📋 DB Alias Dictionary 확인</h2>
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="별칭 검색 (예: 배송받는곳)"
            value={searchAlias}
            onChange={(e) => setSearchAlias(e.target.value)}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              flex: 1,
              maxWidth: '300px',
            }}
          />
          <button
            onClick={fetchAliases}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
        <p style={{ color: '#666', marginBottom: '15px', fontSize: '14px' }}>
          총 {aliases.length}개의 별칭이 저장되어 있습니다.
        </p>
        {aliases.length > 0 ? (
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              border: '1px solid #ccc',
              backgroundColor: 'white',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#e8f4f8' }}>
                <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left', fontSize: '13px' }}>
                  별칭 (Alias)
                </th>
                <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left', fontSize: '13px' }}>
                  기준 헤더
                </th>
                <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left', fontSize: '13px' }}>
                  소스
                </th>
                <th style={{ border: '1px solid #ccc', padding: '10px', textAlign: 'left', fontSize: '13px' }}>
                  생성시간
                </th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((alias) => (
                <tr key={alias.id}>
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '13px', fontWeight: alias.alias === '배송받는곳' ? 'bold' : 'normal', color: alias.alias === '배송받는곳' ? '#0066cc' : 'inherit' }}>
                    {alias.alias}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '13px' }}>
                    {alias.baseHeader}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '13px' }}>
                    {alias.source || '-'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '10px', fontSize: '13px' }}>
                    {new Date(alias.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
            {searchAlias ? `"${searchAlias}"에 대한 별칭이 없습니다.` : '저장된 별칭이 없습니다.'}
          </p>
        )}
      </div>

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
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              원본 헤더
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              AI 매핑
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              기준 헤더
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              소스 타입
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              생성시간
            </th>
            <th style={{ border: '1px solid #ccc', padding: '12px', textAlign: 'left' }}>
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  border: '1px solid #ccc',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#999',
                }}
              >
                매핑 로그가 없습니다.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id}>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.originalHeader}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.aiMappedHeader}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.baseHeader}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {log.sourceType === 'excel' ? '📊 Excel' : log.sourceType === 'text' ? '📝 Text' : log.sourceType}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  {new Date(log.createdAt).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {isAliasAdded(log.originalHeader, log.aiMappedHeader) ? (
                      <span
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓ 추가됨
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAddAlias(log)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Alias 추가
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
