/**
 * EXCLOAD 관리자 팝업 생성 페이지
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PopupCampaign {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
  priority: number;
  target: string;
  showEveryVisit: boolean;
}

export default function AkmanPopupsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PopupCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [target, setTarget] = useState<'ALL' | 'ORDER_CONVERT' | 'HISTORY'>('ALL');
  const [showEveryVisit, setShowEveryVisit] = useState<'EVERY' | 'ONCE'>('EVERY');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/akman/popups');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          router.push('/');
          return;
        }
        throw new Error('목록 조회 실패');
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('[PopupAdminPage] 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [router]);

  const handleUpload = async () => {
    if (!file) {
      window.alert('업로드할 이미지 파일을 선택해 주세요.');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/akman/popups/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '업로드 실패');
      }

      setImageUrl(data.imageUrl);
      window.alert('이미지 업로드가 완료되었습니다.');
    } catch (error: any) {
      window.alert(error.message || '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!title || !imageUrl || !startAt || !endAt) {
      window.alert('제목, 이미지 업로드, 시작/종료 시간을 모두 입력해 주세요.');
      return;
    }

    try {
      const res = await fetch('/api/akman/popups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          imageUrl,
          linkUrl: linkUrl || null,
          startAt,
          endAt,
          isActive,
          priority: Number(priority) || 0,
          target,
          showEveryVisit: showEveryVisit === 'EVERY',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '팝업 생성에 실패했습니다.');
      }

      setTitle('');
      setImageUrl('');
      setFile(null);
      setLinkUrl('');
      setStartAt('');
      setEndAt('');
      setPriority(0);
      setIsActive(true);
      setTarget('ALL');
      setShowEveryVisit('EVERY');
      fetchItems();
    } catch (error: any) {
      window.alert(error.message || '팝업 생성에 실패했습니다.');
    }
  };

  const toggleActive = async (item: PopupCampaign) => {
    try {
      const res = await fetch(`/api/akman/popups/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '상태 변경 실패');
      }
      fetchItems();
    } catch (error: any) {
      window.alert(error.message || '상태 변경에 실패했습니다.');
    }
  };

  const deleteItem = async (item: PopupCampaign) => {
    if (!window.confirm(`"${item.title}" 팝업을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/akman/popups/${item.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '삭제 실패');
      }
      fetchItems();
    } catch (error: any) {
      window.alert(error.message || '삭제에 실패했습니다.');
    }
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
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/akman"
          style={{
            color: '#0066cc',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          ← 관리자 페이지로 돌아가기
        </Link>
      </div>

      <h1 style={{ marginBottom: '20px' }}>팝업 생성</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        팝업 이미지를 등록하고, 노출 기간과 우선순위를 설정하여 사용자 화면에 노출할 수 있습니다.
      </p>

      {/* 생성 폼 */}
      <div
        style={{
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
          backgroundColor: '#f8f9fa',
          marginBottom: '30px',
          maxWidth: '640px',
        }}
      >
        <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>새 팝업 생성</h2>
        <div style={{ display: 'grid', gap: '10px' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (관리자용 메모)"
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc' }}
          />

          {/* 이미지 파일 업로드 */}
          <label style={{ fontSize: 13 }}>
            팝업 이미지 파일
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const selected = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                setFile(selected);
              }}
              style={{
                display: 'block',
                marginTop: 4,
                padding: '4px 0',
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleUpload}
              type="button"
              disabled={uploading || !file}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: uploading ? '#6c757d' : '#0066cc',
                color: 'white',
                fontSize: 13,
                cursor: uploading || !file ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? '업로드 중...' : '이미지 업로드'}
            </button>
            {imageUrl && (
              <span style={{ fontSize: 12, color: '#28a745' }}>업로드 완료</span>
            )}
          </div>
          {imageUrl && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 4,
                border: '1px solid #dee2e6',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>미리보기</div>
              <img
                src={imageUrl}
                alt="popup preview"
                style={{ maxWidth: 240, maxHeight: 120, objectFit: 'contain' }}
              />
            </div>
          )}
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="클릭 시 이동할 링크 (선택)"
            style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #ccc' }}
          />
          <label style={{ fontSize: 13 }}>
            시작 시각
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
                marginLeft: 8,
              }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            종료 시각
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
                marginLeft: 8,
              }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            우선순위
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
                marginLeft: 8,
                width: 100,
              }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            활성화
          </label>

          {/* 팝업 노출 페이지 선택 */}
          <label style={{ fontSize: 13 }}>
            팝업 노출 위치
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'ALL' | 'ORDER_CONVERT' | 'HISTORY')}
              style={{
                marginLeft: 8,
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            >
              <option value="ALL">전체 페이지</option>
              <option value="ORDER_CONVERT">주문변환 페이지만</option>
              <option value="HISTORY">히스토리 페이지만</option>
            </select>
          </label>

          {/* 표시 방식 선택 */}
          <label style={{ fontSize: 13 }}>
            표시 방식
            <select
              value={showEveryVisit}
              onChange={(e) => setShowEveryVisit(e.target.value as 'EVERY' | 'ONCE')}
              style={{
                marginLeft: 8,
                padding: '6px 10px',
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            >
              <option value="EVERY">페이지 이동 시마다 (현재처럼)</option>
              <option value="ONCE">해당 페이지에서 한 번만</option>
            </select>
          </label>
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-start',
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (!imageUrl) {
                  window.alert('먼저 이미지를 업로드해 주세요.');
                  return;
                }
                setIsPreviewOpen(true);
              }}
              style={{
                flex: '0 0 auto',
                padding: '8px 12px',
                borderRadius: 4,
                border: '1px solid #6c757d',
                backgroundColor: 'white',
                color: '#343a40',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              미리보기
            </button>
            <button
              type="button"
              onClick={handleCreate}
              style={{
                flex: '0 0 auto',
                padding: '8px 12px',
                borderRadius: 4,
                border: 'none',
                backgroundColor: '#0066cc',
                color: 'white',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              팝업 생성
            </button>
          </div>
        </div>
      </div>

      {/* 등록된 팝업 목록 */}
      <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>등록된 팝업</h2>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #ccc',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>제목</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>이미지</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>기간</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>우선순위</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>노출 위치</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>표시 방식</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>상태</th>
            <th style={{ border: '1px solid #ccc', padding: 10 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#999' }}>
                등록된 팝업이 없습니다.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>{item.title}</td>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain' }}
                  />
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10, fontSize: 12 }}>
                  {new Date(item.startAt).toLocaleString('ko-KR')}
                  <br />~ {new Date(item.endAt).toLocaleString('ko-KR')}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10, textAlign: 'right' }}>
                  {item.priority}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>
                  {item.target === 'ORDER_CONVERT'
                    ? '주문변환 페이지'
                    : item.target === 'HISTORY'
                    ? '히스토리 페이지'
                    : '전체 페이지'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>
                  {item.showEveryVisit ? '이동 시마다' : '한 번만'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>
                  {item.isActive ? '활성' : '비활성'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 10 }}>
                  <button
                    onClick={() => toggleActive(item)}
                    style={{
                      padding: '4px 8px',
                      marginRight: 6,
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: item.isActive ? '#6c757d' : '#28a745',
                      color: 'white',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {item.isActive ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: 'none',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 미리보기 모달 */}
      {isPreviewOpen && imageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              overflow: 'hidden',
              width: 'auto',
              maxWidth: '90vw',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                maxHeight: '80vh',
                overflow: 'hidden',
              }}
            >
              <img
                src={imageUrl}
                alt={title || 'popup preview'}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
              }}
            >
              <div style={{ color: '#555' }}>
                {target === 'ORDER_CONVERT'
                  ? '주문변환 페이지'
                  : target === 'HISTORY'
                  ? '히스토리 페이지'
                  : '전체 페이지'}{' '}
                / {showEveryVisit === 'EVERY' ? '페이지 이동 시마다' : '해당 페이지에서 한 번만'}
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

