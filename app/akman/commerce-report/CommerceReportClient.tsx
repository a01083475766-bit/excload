'use client';

/**
 * 커머스 리포트 / 뉴스레터 — 관리자 전용 내부 도구
 *
 * ⚠️ EXCLOAD CONSTITUTION 준수
 * 주문 변환 파이프라인(Stage0~3)과 완전히 독립된 관리자 기능입니다.
 *
 * 진행 단계(현재 Phase A/B):
 * - ②오늘 데이터 상태·③TOP10·④~⑤뉴스레터 생성/미리보기 → mock 데이터
 * - ⑦설정(키워드·금지표현·광고문구·문체) → 실제 DB 연동
 * - 네이버 API 수집(Phase C)·AI 생성 연동(Phase D)은 이후 단계에서 교체됩니다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type {
  CommerceKeywordRow,
  CommerceNewsletterDraft,
  CommerceReportSettingsData,
  CommerceReportTone,
} from '@/app/lib/commerce-report/types';
import { COMMERCE_REPORT_TONE_OPTIONS } from '@/app/lib/commerce-report/types';
import {
  MOCK_COLLECT_STATUS,
  MOCK_KEYWORD_STATS,
  MOCK_NEWSLETTER_DRAFT_EMPTY,
  MOCK_NEWSLETTER_DRAFT_SAMPLE,
} from '@/app/lib/commerce-report/mock-data';

const shell: React.CSSProperties = {
  padding: '40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '1080px',
};

const sectionCard: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: '10px',
  padding: '20px 24px',
  marginBottom: '20px',
  background: '#fff',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  marginBottom: '14px',
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '14px',
  marginBottom: '24px',
};

const statCard: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  padding: '16px',
  background: '#fafafa',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  border: '1px solid #175cd3',
  background: '#175cd3',
  color: '#fff',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '14px',
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 16px',
  border: '1px solid #d0d5dd',
  background: '#fff',
  color: '#344054',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '14px',
};

const btnSmall: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #d0d5dd',
  background: '#fff',
  color: '#344054',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #d0d5dd',
  borderRadius: '6px',
  fontSize: '14px',
  width: '100%',
};

const mockNoticeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#b45309',
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '6px',
  padding: '6px 10px',
  marginBottom: '12px',
  display: 'inline-block',
};

function formatDateTime(value: string | null): string {
  if (!value) return '수집 기록 없음';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}%`;
}

function pctColor(value: number): string {
  if (value > 0) return '#15803d';
  if (value < 0) return '#b91c1c';
  return '#666';
}

async function copyToClipboard(text: string, onDone: (label: string) => void, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    onDone(label);
    window.setTimeout(() => onDone(''), 1600);
  } catch {
    window.alert('복사하지 못했습니다. 텍스트를 직접 선택해서 복사해 주세요.');
  }
}

export default function CommerceReportClient() {
  const pathname = usePathname();
  const adminHome = pathname?.startsWith('/admin') ? '/admin' : '/akman';

  // ③ TOP10 · ② 오늘 데이터 상태 — 현재 mock
  const collectStatus = MOCK_COLLECT_STATUS;
  const keywordStats = MOCK_KEYWORD_STATS;

  // ④~⑥ 뉴스레터 생성·미리보기·복사 — 현재 mock
  const [draft, setDraft] = useState<CommerceNewsletterDraft>(MOCK_NEWSLETTER_DRAFT_EMPTY);
  const [generating, setGenerating] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState('');

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    window.setTimeout(() => {
      setDraft(MOCK_NEWSLETTER_DRAFT_SAMPLE);
      setGenerating(false);
    }, 900);
  }, []);

  // ⑦ 설정 — 실제 DB 연동 (키워드 · 금지표현 · 광고문구 · 문체)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keywords, setKeywords] = useState<CommerceKeywordRow[]>([]);
  const [keywordsLoading, setKeywordsLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordCategory, setNewKeywordCategory] = useState('');
  const [keywordSaving, setKeywordSaving] = useState(false);

  const [settings, setSettings] = useState<CommerceReportSettingsData | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [bannedWordsInput, setBannedWordsInput] = useState('');
  const [adPhraseInput, setAdPhraseInput] = useState('');
  const [toneInput, setToneInput] = useState<CommerceReportTone>('PLAIN');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const loadKeywords = useCallback(async () => {
    setKeywordsLoading(true);
    try {
      const res = await fetch('/api/akman/commerce-report/keywords', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setKeywords(data.keywords);
      }
    } catch {
      // 목록 조회 실패 시 빈 목록 유지
    } finally {
      setKeywordsLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/akman/commerce-report/settings', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSettings(data.settings);
        setBannedWordsInput(data.settings.bannedWords.join(', '));
        setAdPhraseInput(data.settings.adPhrase);
        setToneInput(data.settings.toneStyle);
      }
    } catch {
      // 설정 조회 실패 시 기본값 유지
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadKeywords();
    void loadSettings();
  }, [settingsOpen, loadKeywords, loadSettings]);

  const addKeyword = async () => {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setKeywordSaving(true);
    try {
      const res = await fetch('/api/akman/commerce-report/keywords', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, category: newKeywordCategory.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        window.alert(data.error || '키워드 등록에 실패했습니다.');
        return;
      }
      setNewKeyword('');
      setNewKeywordCategory('');
      await loadKeywords();
    } finally {
      setKeywordSaving(false);
    }
  };

  const toggleKeywordActive = async (id: string, isActive: boolean) => {
    setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, isActive } : k)));
    await fetch(`/api/akman/commerce-report/keywords/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
  };

  const deleteKeyword = async (id: string) => {
    if (!window.confirm('이 키워드를 삭제할까요?')) return;
    await fetch(`/api/akman/commerce-report/keywords/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await loadKeywords();
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      const bannedWords = bannedWordsInput
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
      const res = await fetch('/api/akman/commerce-report/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bannedWords, adPhrase: adPhraseInput, toneStyle: toneInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSettingsMessage(data.error || '저장에 실패했습니다.');
        return;
      }
      setSettings(data.settings);
      setSettingsMessage('저장되었습니다.');
    } catch {
      setSettingsMessage('저장 중 오류가 발생했습니다.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const activeKeywordCount = useMemo(
    () => keywords.filter((k) => k.isActive).length,
    [keywords],
  );
  const topOpportunity = keywordStats[0];

  return (
    <div style={shell}>
      <div style={{ marginBottom: '20px' }}>
        <Link href={adminHome} style={{ fontSize: '13px', color: '#175cd3', textDecoration: 'none' }}>
          ← 관리자 홈
        </Link>
      </div>

      <h1 style={{ marginBottom: '4px', fontSize: '1.5rem' }}>커머스 리포트 / 뉴스레터</h1>
      <p style={{ color: '#666', marginBottom: '20px', fontSize: '14px' }}>
        관리자가 검토 후 블로그·카페에 게시할 커머스 뉴스레터를 생성하는 내부 운영 도구입니다.
        (일반 사용자에게는 노출되지 않습니다)
      </p>

      {/* ① 상단 요약 카드 */}
      <div style={cardGrid}>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>관리 키워드</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {keywordsLoading ? '-' : `${activeKeywordCount}개`}
          </div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>오늘 수집</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {collectStatus.isCollectedToday ? '완료' : '미수집'}
          </div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>TOP1 기회 점수</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {topOpportunity.opportunityScore}점 &quot;{topOpportunity.keyword}&quot;
          </div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>draft 상태</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {draft.status === 'DRAFT' ? '1건 대기' : '없음'}
          </div>
        </div>
      </div>

      {/* ② 오늘 데이터 상태 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>오늘 데이터 상태</div>
        <div style={mockNoticeStyle}>mock 데이터 — 네이버 API 수집 연동 전 단계</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', fontSize: '14px' }}>
          <div>
            <div style={{ color: '#666', fontSize: '12px' }}>수집 완료 여부</div>
            <div style={{ fontWeight: 600 }}>
              {collectStatus.hasPartialFailure ? '▲ 일부 실패' : collectStatus.isCollectedToday ? '● 완료' : '○ 미수집'}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '12px' }}>마지막 수집 시간</div>
            <div style={{ fontWeight: 600 }}>{formatDateTime(collectStatus.lastCollectedAt)}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '12px' }}>수집 키워드 수</div>
            <div style={{ fontWeight: 600 }}>
              {collectStatus.collectedKeywordCount} / {collectStatus.totalKeywordCount}
            </div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '12px' }}>실패 건수</div>
            <div style={{ fontWeight: 600 }}>{collectStatus.failedCount}건</div>
          </div>
        </div>
        <div style={{ marginTop: '14px' }}>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => window.alert('네이버 API 수집 연동은 다음 단계(Phase C)에서 진행됩니다.')}
          >
            지금 다시 수집
          </button>
        </div>
      </div>

      {/* ③ 키워드 TOP 10 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>키워드 TOP 10</div>
        <div style={mockNoticeStyle}>mock 데이터 — 실제 수집 데이터로 교체될 예정</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', color: '#666' }}>
                <th style={{ padding: '8px 6px' }}>순위</th>
                <th style={{ padding: '8px 6px' }}>키워드</th>
                <th style={{ padding: '8px 6px' }}>전주 대비</th>
                <th style={{ padding: '8px 6px' }}>전년 대비</th>
                <th style={{ padding: '8px 6px' }}>상품수</th>
                <th style={{ padding: '8px 6px' }}>평균가</th>
                <th style={{ padding: '8px 6px' }}>경쟁강도</th>
                <th style={{ padding: '8px 6px' }}>기회점수</th>
              </tr>
            </thead>
            <tbody>
              {keywordStats.map((row) => (
                <tr key={row.rank} style={{ borderBottom: '1px solid #f2f2f2' }}>
                  <td style={{ padding: '8px 6px' }}>{row.rank}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.keyword}</td>
                  <td style={{ padding: '8px 6px', color: pctColor(row.weekOverWeekPct) }}>
                    {formatPct(row.weekOverWeekPct)}
                  </td>
                  <td style={{ padding: '8px 6px', color: pctColor(row.yearOverYearPct) }}>
                    {formatPct(row.yearOverYearPct)}
                  </td>
                  <td style={{ padding: '8px 6px' }}>{row.productCount.toLocaleString()}</td>
                  <td style={{ padding: '8px 6px' }}>{row.avgPrice.toLocaleString()}원</td>
                  <td style={{ padding: '8px 6px' }}>{row.competitionScore}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.opportunityScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ④~⑥ 뉴스레터 생성 · 미리보기 · 복사 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>뉴스레터 생성</div>
        <div style={mockNoticeStyle}>mock 문장 미리보기 — AI 게이트웨이 연동 전 단계</div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
          <button type="button" style={btnPrimary} onClick={handleGenerate} disabled={generating}>
            {generating ? '생성 중…' : '오늘 뉴스레터 생성'}
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={handleGenerate}
            disabled={generating || draft.status !== 'DRAFT'}
          >
            재생성
          </button>
          <span style={{ fontSize: '13px', color: '#666' }}>
            상태: {draft.status === 'DRAFT' ? 'draft 있음' : 'draft 없음'}
          </span>
        </div>

        {draft.status === 'DRAFT' && (
          <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>제목</div>
              <div style={{ fontWeight: 600 }}>{draft.title}</div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>요약</div>
              <div style={{ fontSize: '14px' }}>{draft.summary}</div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>본문</div>
              <div
                style={{
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  background: '#fff',
                  border: '1px solid #eee',
                  borderRadius: '6px',
                  padding: '10px',
                }}
              >
                {draft.body}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>태그</div>
              <div style={{ fontSize: '14px' }}>
                {draft.tags.map((t) => `#${t}`).join(' ')}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button type="button" style={btnSmall} onClick={() => copyToClipboard(draft.title, setCopiedLabel, '제목')}>
                제목 복사
              </button>
              <button type="button" style={btnSmall} onClick={() => copyToClipboard(draft.summary, setCopiedLabel, '요약')}>
                요약 복사
              </button>
              <button type="button" style={btnSmall} onClick={() => copyToClipboard(draft.body, setCopiedLabel, '본문')}>
                본문 복사
              </button>
              <button
                type="button"
                style={btnSmall}
                onClick={() => copyToClipboard(draft.tags.map((t) => `#${t}`).join(' '), setCopiedLabel, '태그')}
              >
                태그 복사
              </button>
              {copiedLabel && (
                <span style={{ fontSize: '13px', color: '#15803d', alignSelf: 'center' }}>
                  {copiedLabel} 복사됨
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ⑦ 설정 (접이식) */}
      <div style={sectionCard}>
        <div
          style={{ ...sectionTitle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <span>설정</span>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>
            {settingsOpen ? '접기 ▲' : '펼치기 ▼'}
          </span>
        </div>

        {settingsOpen && (
          <div style={{ marginTop: '10px' }}>
            {/* 관리 키워드 */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>관리 키워드</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  style={{ ...inputStyle, maxWidth: '220px' }}
                  placeholder="키워드"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                />
                <input
                  style={{ ...inputStyle, maxWidth: '160px' }}
                  placeholder="카테고리 (선택)"
                  value={newKeywordCategory}
                  onChange={(e) => setNewKeywordCategory(e.target.value)}
                />
                <button type="button" style={btnSmall} onClick={() => void addKeyword()} disabled={keywordSaving}>
                  추가
                </button>
              </div>

              {keywordsLoading ? (
                <p style={{ fontSize: '13px', color: '#666' }}>불러오는 중…</p>
              ) : keywords.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#666' }}>등록된 키워드가 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {keywords.map((k) => (
                    <div
                      key={k.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '999px',
                        padding: '4px 6px 4px 12px',
                        fontSize: '13px',
                        opacity: k.isActive ? 1 : 0.5,
                      }}
                    >
                      <span>
                        {k.keyword}
                        {k.category ? ` · ${k.category}` : ''}
                      </span>
                      <button
                        type="button"
                        title={k.isActive ? '비활성화' : '활성화'}
                        onClick={() => void toggleKeywordActive(k.id, !k.isActive)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px' }}
                      >
                        {k.isActive ? '⏸' : '▶'}
                      </button>
                      <button
                        type="button"
                        title="삭제"
                        onClick={() => void deleteKeyword(k.id)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', color: '#b91c1c' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 금지 표현 · 광고 문구 · 문체 */}
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                금지 표현 (쉼표로 구분)
              </div>
              <input
                style={inputStyle}
                value={bannedWordsInput}
                onChange={(e) => setBannedWordsInput(e.target.value)}
                placeholder="최고, 보장, 무조건"
                disabled={settingsLoading}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>엑클로드 광고 문구</div>
              <input
                style={inputStyle}
                value={adPhraseInput}
                onChange={(e) => setAdPhraseInput(e.target.value)}
                disabled={settingsLoading}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>뉴스레터 문체</div>
              <select
                style={{ ...inputStyle, maxWidth: '200px' }}
                value={toneInput}
                onChange={(e) => setToneInput(e.target.value as CommerceReportTone)}
                disabled={settingsLoading}
              >
                {COMMERCE_REPORT_TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button type="button" style={btnPrimary} onClick={() => void saveSettings()} disabled={settingsSaving}>
                {settingsSaving ? '저장 중…' : '저장'}
              </button>
              {settingsMessage && (
                <span style={{ fontSize: '13px', color: '#15803d' }}>{settingsMessage}</span>
              )}
              {settings && (
                <span style={{ fontSize: '12px', color: '#999' }}>
                  최근 저장: {formatDateTime(settings.updatedAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
