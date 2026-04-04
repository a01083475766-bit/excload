'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface PopupCampaign {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  startAt: string;
  endAt: string;
  target: string;
  showEveryVisit: boolean;
}

type HideMode = 'today' | '7days' | 'forever';

interface HideInfo {
  mode: HideMode;
  until: number;
}

function getHideInfo(id: string): HideInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(`popup_hide_${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HideInfo;
    if (parsed.until && parsed.until > Date.now()) return parsed;
  } catch {
    return null;
  }
  return null;
}

function setHideInfo(id: string, mode: HideMode, days: number) {
  if (typeof window === 'undefined') return;
  const now = new Date();

  if (mode === 'today') {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    window.localStorage.setItem(
      `popup_hide_${id}`,
      JSON.stringify({ mode, until: endOfDay.getTime() })
    );
  } else if (mode === '7days') {
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    window.localStorage.setItem(
      `popup_hide_${id}`,
      JSON.stringify({ mode, until: until.getTime() })
    );
  } else {
    const until = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
    window.localStorage.setItem(
      `popup_hide_${id}`,
      JSON.stringify({ mode, until: until.getTime() })
    );
  }
}

export default function GlobalPopupManager() {
  const [popups, setPopups] = useState<PopupCampaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const fetchPopups = async () => {
      try {
        const res = await fetch('/api/popups/active');
        const data = await res.json();
        if (!res.ok || !data.success) {
          setPopups([]);
          return;
        }
        const list: PopupCampaign[] = data.popups || [];

        // 현재 페이지에 해당하는 타겟 키 계산
        const currentKey =
          pathname.startsWith('/order-convert') || pathname.startsWith('/invoice-file-convert')
            ? 'ORDER_CONVERT'
            : pathname.startsWith('/history')
            ? 'HISTORY'
            : 'ALL';

        const filtered = list.filter((p) => {
          if (getHideInfo(p.id)) return false;
          if (p.target && p.target !== 'ALL' && p.target !== currentKey) return false;

          // showEveryVisit=false 인 경우, 현재 세션에서 이미 본 팝업이면 건너뛰기
          if (!p.showEveryVisit && typeof window !== 'undefined') {
            const seenKey = `popup_seen_${p.id}_${currentKey}`;
            if (window.sessionStorage.getItem(seenKey)) {
              return false;
            }
          }

          return true;
        });
        setPopups(filtered);
        setCurrentIndex(0);
      } catch (error) {
        console.error('[GlobalPopupManager] 팝업 조회 실패:', error);
        setPopups([]);
      } finally {
        setLoaded(true);
      }
    };

    fetchPopups();
  }, [pathname]);

  if (!loaded || popups.length === 0) return null;

  const current = popups[currentIndex];
  if (!current) return null;

  const closeAndNext = () => {
    // 한 번만 보이도록 설정된 팝업이면, 현재 페이지 키 기준으로 세션에 기록
    if (!current.showEveryVisit && typeof window !== 'undefined') {
      const currentKey =
        pathname.startsWith('/order-convert') || pathname.startsWith('/invoice-file-convert')
          ? 'ORDER_CONVERT'
          : pathname.startsWith('/history')
          ? 'HISTORY'
          : 'ALL';
      const seenKey = `popup_seen_${current.id}_${currentKey}`;
      window.sessionStorage.setItem(seenKey, '1');
    }
    if (currentIndex + 1 < popups.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setPopups([]);
    }
  };

  const handleHide = (mode: HideMode) => {
    if (mode === 'today') {
      setHideInfo(current.id, 'today', 0);
    } else if (mode === '7days') {
      setHideInfo(current.id, '7days', 7);
    } else {
      setHideInfo(current.id, 'forever', 0);
    }
    closeAndNext();
  };

  const handleClickImage = () => {
    if (current.linkUrl) {
      window.open(current.linkUrl, '_blank');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.45)',
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
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            onClick={handleClickImage}
            style={{
              cursor: current.linkUrl ? 'pointer' : 'default',
              maxHeight: '80vh',
              overflow: 'hidden',
            }}
          >
            <img
              src={current.imageUrl}
              alt={current.title}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
          {/* 우측 상단 X 버튼 */}
          <button
            onClick={closeAndNext}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: '999px',
              border: 'none',
              backgroundColor: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: 16,
              lineHeight: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            aria-label="닫기"
            type="button"
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: '8px 14px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 11,
            borderTop: '1px solid #e9ecef',
            backgroundColor: '#f8f9fa',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              color: '#495057',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={() => handleHide('today')}
                style={{ margin: 0 }}
              />
              <span>오늘은 그만보기</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={() => handleHide('7days')}
                style={{ margin: 0 }}
              />
              <span>일주일간 보지 않기</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                onChange={() => handleHide('forever')}
                style={{ margin: 0 }}
              />
              <span>앞으로 안 보기</span>
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#868e96' }}>
              {currentIndex + 1} / {popups.length}
            </span>
            <button
              onClick={closeAndNext}
              style={{
                padding: '5px 12px',
                borderRadius: 16,
                border: '1px solid #ced4da',
                backgroundColor: '#ffffff',
                color: '#343a40',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
              type="button"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

