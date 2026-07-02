'use client';

/**
 * 커머스 리포트 / 뉴스레터 — 관리자 전용 내부 도구
 *
 * ⚠️ EXCLOAD CONSTITUTION 준수
 * 주문 변환 파이프라인(Stage0~3)과 완전히 독립된 관리자 기능입니다.
 *
 * 진행 단계:
 * - ②오늘 참고 데이터 → 네이버 쇼핑/블로그/뉴스 검색 API 실시간 조회 (DB 저장 없음, 새로고침 시 소실)
 * - ②-A 추천 키워드 자동 찾기 → 시드 키워드로 쇼핑 검색만 조회해 후보 추출 후, 선택한 후보로
 *   ②와 동일한 로직(naver-preview·computeKeywordStats)을 재사용해 "오늘의 상품 아이디어 TOP10"을 계산
 *   (관리 키워드 흐름과 완전히 분리된 별도 state, DB 저장 없음, 새로고침 시 소실)
 * - ③키워드 TOP10 → ②에서 조회한 참고 데이터를 바탕으로 한 순수 계산(경쟁강도·기회점수, 판매량/매출 아님)
 * - ④~⑥뉴스레터 생성/미리보기/복사 → ②참고 데이터 기반 AI 초안 생성 (DB 저장 없음)
 * - ⑦설정(키워드·금지표현·광고문구·문체) → 실제 DB 연동
 * - 전주/전년 대비 계산(쇼핑인사이트 미연동), cron 자동 수집은 아직 진행하지 않습니다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type {
  CommerceKeywordRow,
  CommerceNewsletterDraft,
  CommerceReportSettingsData,
  CommerceReportTone,
  KeywordReferenceSummary,
} from '@/app/lib/commerce-report/types';
import { COMMERCE_REPORT_TONE_OPTIONS } from '@/app/lib/commerce-report/types';
import { MOCK_NEWSLETTER_DRAFT_EMPTY } from '@/app/lib/commerce-report/mock-data';
import { computeKeywordStats } from '@/app/lib/commerce-report/keyword-stats';
import { DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS, MAX_SEED_KEYWORDS } from '@/app/lib/commerce-report/constants';

const MAX_PREVIEW_KEYWORDS = 10;
const DEFAULT_PREVIEW_KEYWORD_COUNT = 5;
const MAX_RECOMMENDED_SELECTION = 10;
const DEFAULT_RECOMMENDED_SELECTION_COUNT = 10;

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

function formatDateTime(value: string | null): string {
  if (!value) return '기록 없음';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatWon(value: number): string {
  return `${value.toLocaleString()}원`;
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

  // ② 오늘 참고 데이터 — 네이버 쇼핑 검색 API 실시간 조회 (DB 저장 없음)
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set());
  const defaultSelectionAppliedRef = useRef(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResults, setPreviewResults] = useState<KeywordReferenceSummary[]>([]);
  const [previewFailedKeywords, setPreviewFailedKeywords] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFetchedAt, setPreviewFetchedAt] = useState<string | null>(null);

  // ②-A 추천 키워드 자동 찾기 — 관리 키워드 흐름과 완전히 분리된 별도 state (DB 저장 없음, 새로고침 시 소실)
  const [seedKeywordsInput, setSeedKeywordsInput] = useState(DEFAULT_COMMERCE_REPORT_SEED_KEYWORDS.join(', '));
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [candidatesFailedSeeds, setCandidatesFailedSeeds] = useState<string[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [recommendedResults, setRecommendedResults] = useState<KeywordReferenceSummary[]>([]);
  const [recommendedFailedKeywords, setRecommendedFailedKeywords] = useState<string[]>([]);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [recommendedFetchedAt, setRecommendedFetchedAt] = useState<string | null>(null);

  const recommendedKeywordStats = useMemo(
    () => computeKeywordStats(recommendedResults),
    [recommendedResults],
  );

  // ③ 키워드 TOP 10 — 조회된 참고 데이터(previewResults)를 바탕으로 계산 (DB 저장·API 호출 없는 순수 계산)
  const keywordStats = useMemo(() => computeKeywordStats(previewResults), [previewResults]);

  // ④~⑥ 뉴스레터 생성·미리보기·복사 — 참고 데이터 기반 AI 초안 생성 (DB 저장 없음)
  const [draft, setDraft] = useState<CommerceNewsletterDraft>(MOCK_NEWSLETTER_DRAFT_EMPTY);
  const [generating, setGenerating] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [bannedWordsFound, setBannedWordsFound] = useState<string[]>([]);
  const [copiedLabel, setCopiedLabel] = useState('');

  const handleGenerate = useCallback(async () => {
    if (previewResults.length === 0) {
      window.alert('먼저 오늘 참고 데이터를 조회해 주세요.');
      return;
    }
    setGenerating(true);
    setDraftError(null);
    try {
      const res = await fetch('/api/akman/commerce-report/newsletter-draft', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordSummaries: previewResults }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDraftError(data.error || '초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setBannedWordsFound(Array.isArray(data.bannedWordsFound) ? data.bannedWordsFound : []);
      setDraft({
        status: 'DRAFT',
        title: data.draft.title,
        summary: data.draft.summary,
        body: data.draft.body,
        tags: data.draft.tags,
        generatedAt: new Date().toISOString(),
      });
    } catch {
      setDraftError('초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setGenerating(false);
    }
  }, [previewResults]);

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

  // 관리 키워드는 ②참고 데이터 조회의 체크박스 목록으로도 쓰이므로 진입 시 바로 불러옴
  useEffect(() => {
    void loadKeywords();
  }, [loadKeywords]);

  useEffect(() => {
    if (!settingsOpen) return;
    void loadSettings();
  }, [settingsOpen, loadSettings]);

  // 활성 키워드 로딩 완료 후, 앞쪽 5개를 기본 선택
  useEffect(() => {
    if (defaultSelectionAppliedRef.current) return;
    if (keywordsLoading) return;
    const defaults = keywords
      .filter((k) => k.isActive)
      .slice(0, DEFAULT_PREVIEW_KEYWORD_COUNT)
      .map((k) => k.id);
    if (defaults.length > 0) {
      setSelectedKeywordIds(new Set(defaults));
    }
    defaultSelectionAppliedRef.current = true;
  }, [keywords, keywordsLoading]);

  const activeKeywords = useMemo(() => keywords.filter((k) => k.isActive), [keywords]);

  const toggleSelectedKeyword = (id: string) => {
    setSelectedKeywordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PREVIEW_KEYWORDS) {
          window.alert(`한 번에 최대 ${MAX_PREVIEW_KEYWORDS}개까지 선택할 수 있습니다.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const fetchNaverPreview = async () => {
    const selectedKeywords = activeKeywords
      .filter((k) => selectedKeywordIds.has(k.id))
      .map((k) => k.keyword);

    if (selectedKeywords.length === 0) {
      window.alert('조회할 키워드를 선택해 주세요.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/akman/commerce-report/naver-preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: selectedKeywords }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPreviewError(data.error || '참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setPreviewResults([]);
        setPreviewFailedKeywords([]);
        return;
      }
      // success: true이지만 일부/전체 키워드가 실패한 경우, 서버가 내려준 원인 문구를 그대로 노출
      setPreviewError(typeof data.error === 'string' ? data.error : null);
      setPreviewResults(data.results ?? []);
      setPreviewFailedKeywords(data.failedKeywords ?? []);
      setPreviewFetchedAt(new Date().toISOString());
    } catch {
      setPreviewError('참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setPreviewResults([]);
      setPreviewFailedKeywords([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const fetchKeywordCandidates = async () => {
    const seedKeywords = seedKeywordsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (seedKeywords.length === 0) {
      window.alert('시드 키워드를 입력해 주세요.');
      return;
    }

    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const res = await fetch('/api/akman/commerce-report/keyword-candidates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedKeywords }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCandidatesError(data.error || '추천 키워드 후보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setCandidates([]);
        setSelectedCandidates(new Set());
        setCandidatesFailedSeeds([]);
        return;
      }
      const foundCandidates: string[] = data.candidates ?? [];
      setCandidatesError(typeof data.error === 'string' ? data.error : null);
      setCandidates(foundCandidates);
      setCandidatesFailedSeeds(data.failedSeedKeywords ?? []);
      setSelectedCandidates(new Set(foundCandidates.slice(0, DEFAULT_RECOMMENDED_SELECTION_COUNT)));
      // 새로 후보를 찾으면 이전 추천 리포트는 최신 후보 기준으로 다시 만들어야 하므로 비워 둠
      setRecommendedResults([]);
      setRecommendedFetchedAt(null);
      setRecommendedError(null);
    } catch {
      setCandidatesError('추천 키워드 후보를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setCandidates([]);
      setSelectedCandidates(new Set());
      setCandidatesFailedSeeds([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  const toggleSelectedCandidate = (candidate: string) => {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(candidate)) {
        next.delete(candidate);
      } else {
        if (next.size >= MAX_RECOMMENDED_SELECTION) {
          window.alert(`한 번에 최대 ${MAX_RECOMMENDED_SELECTION}개까지 선택할 수 있습니다.`);
          return prev;
        }
        next.add(candidate);
      }
      return next;
    });
  };

  const fetchRecommendedReport = async () => {
    const keywords = [...selectedCandidates];
    if (keywords.length === 0) {
      window.alert('후보 키워드를 선택해 주세요.');
      return;
    }

    setRecommendedLoading(true);
    setRecommendedError(null);
    try {
      const res = await fetch('/api/akman/commerce-report/naver-preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRecommendedError(data.error || '참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setRecommendedResults([]);
        setRecommendedFailedKeywords([]);
        return;
      }
      setRecommendedError(typeof data.error === 'string' ? data.error : null);
      setRecommendedResults(data.results ?? []);
      setRecommendedFailedKeywords(data.failedKeywords ?? []);
      setRecommendedFetchedAt(new Date().toISOString());
    } catch {
      setRecommendedError('참고 데이터를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setRecommendedResults([]);
      setRecommendedFailedKeywords([]);
    } finally {
      setRecommendedLoading(false);
    }
  };

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
  const topOpportunity = keywordStats[0] ?? null;

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
          <div style={{ fontSize: '13px', color: '#666' }}>참고 데이터 조회</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {previewFetchedAt ? formatDateTime(previewFetchedAt) : '조회 전'}
          </div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>TOP1 기회 점수</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {topOpportunity ? (
              <>
                {topOpportunity.opportunityScore}점 &quot;{topOpportunity.keyword}&quot;
              </>
            ) : (
              '조회 전'
            )}
          </div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: '13px', color: '#666' }}>draft 상태</div>
          <div style={{ fontSize: '22px', fontWeight: 600 }}>
            {draft.status === 'DRAFT' ? '1건 대기' : '없음'}
          </div>
        </div>
      </div>

      {/* ② 오늘 참고 데이터 — 네이버 쇼핑 검색 API 실시간 조회, DB 저장 없음 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>오늘 참고 데이터</div>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
          버튼을 누르면 네이버 쇼핑 검색 API를 그 자리에서 조회해 요약값만 보여줍니다.
          원본 응답·상품 리스트는 저장하지 않으며, 새로고침하면 결과가 사라집니다.
        </p>

        {keywordsLoading ? (
          <p style={{ fontSize: '13px', color: '#666' }}>키워드 목록을 불러오는 중…</p>
        ) : activeKeywords.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#b45309' }}>
            먼저 설정에서 관리 키워드를 추가해 주세요.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {activeKeywords.map((k) => {
                const checked = selectedKeywordIds.has(k.id);
                return (
                  <label
                    key={k.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: `1px solid ${checked ? '#175cd3' : '#d0d5dd'}`,
                      background: checked ? '#eff6ff' : '#fff',
                      borderRadius: '999px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedKeyword(k.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    {k.keyword}
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <button type="button" style={btnPrimary} onClick={() => void fetchNaverPreview()} disabled={previewLoading}>
                {previewLoading ? '조회 중…' : '오늘 참고 데이터 가져오기'}
              </button>
              <span style={{ fontSize: '12px', color: '#666' }}>
                선택 {selectedKeywordIds.size} / 최대 {MAX_PREVIEW_KEYWORDS}개
              </span>
            </div>
          </>
        )}

        {previewError && (
          <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '12px' }}>{previewError}</p>
        )}

        {previewFailedKeywords.length > 0 && (
          <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '12px' }}>
            {previewFailedKeywords.join(', ')} 키워드는 조회에 실패했습니다.
          </p>
        )}

        {previewResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {previewResults.map((r) => (
              <div key={r.keyword} style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px 14px', background: '#fafafa' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>{r.keyword}</div>

                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  상품수: <strong>{r.shopping.productCount.toLocaleString()}개</strong>
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  가격대: {formatWon(r.shopping.priceRange.min)} ~ {formatWon(r.shopping.priceRange.max)}
                  {' '}(평균 {formatWon(r.shopping.priceRange.avg)}, 표본 {r.shopping.priceRange.sampleSize}개)
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  대표 카테고리: {r.shopping.representativeCategory ?? '-'}
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  자주 보이는 단어: {r.shopping.frequentWords.length > 0 ? r.shopping.frequentWords.join(', ') : '-'}
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  브랜드 TOP 3: {r.shopping.topBrands.length > 0 ? r.shopping.topBrands.join(', ') : '-'}
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '4px' }}>
                  쇼핑몰 TOP 3: {r.shopping.topMalls.length > 0 ? r.shopping.topMalls.join(', ') : '-'}
                </div>
                <div style={{ fontSize: '13px', color: '#444', marginBottom: '8px' }}>
                  가격 구간: {r.shopping.priceBuckets
                    .filter((b) => b.ratio > 0)
                    .map((b) => `${b.range} ${Math.round(b.ratio * 100)}%`)
                    .join(', ') || '-'}
                </div>

                <div
                  style={{
                    borderTop: '1px dashed #d0d5dd',
                    paddingTop: '8px',
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#444',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>블로그 언급</div>
                  {r.blog ? (
                    <>
                      <div>
                        최근 {r.blog.periodDays}일 기준, {r.blog.usedCount.toLocaleString()}건 반영 / {r.blog.excludedOldCount.toLocaleString()}건 제외
                      </div>
                      <div>
                        자주 쓰는 표현: {r.blog.frequentPhrases.length > 0 ? r.blog.frequentPhrases.join(', ') : '-'}
                      </div>
                      <div>
                        고민형 표현: {r.blog.concernPhrases.length > 0 ? r.blog.concernPhrases.join(', ') : '-'}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#999' }}>조회되지 않았습니다.</div>
                  )}
                </div>

                <div
                  style={{
                    borderTop: '1px dashed #d0d5dd',
                    paddingTop: '8px',
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#444',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>뉴스 이슈</div>
                  {r.news ? (
                    <>
                      <div>
                        최근 {r.news.periodDays}일 기준, {r.news.usedCount.toLocaleString()}건 반영 / {r.news.excludedOldCount.toLocaleString()}건 제외
                      </div>
                      <div>이슈 키워드: {r.news.issueKeywords.length > 0 ? r.news.issueKeywords.join(', ') : '-'}</div>
                    </>
                  ) : (
                    <div style={{ color: '#999' }}>조회되지 않았습니다.</div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
                  조회 시각: {formatDateTime(r.fetchedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        ②-A 추천 키워드 자동 찾기 — 관리 키워드 흐름과 완전히 분리된 별도 섹션/별도 state.
        DB 저장 없음, Prisma 모델 없음, 후보 키워드를 관리 키워드 DB에 저장하는 기능도 없음.
        새로고침하면 후보·리포트 결과 모두 사라집니다.
      */}
      <div style={sectionCard}>
        <div style={sectionTitle}>추천 키워드 자동 찾기</div>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
          이 기능은 네이버 쇼핑 검색 결과의 상품명 표현을 참고해 후보 키워드를 자동 추출합니다.
        </p>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
          판매순위, 판매량, 매출, 거래량을 의미하지 않습니다.
        </p>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
          후보 키워드는 관리자가 선택한 뒤 리포트를 만들 수 있습니다.
        </p>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
            시드 키워드 (쉼표로 구분, 최대 {MAX_SEED_KEYWORDS}개까지 사용됩니다)
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, maxWidth: '480px' }}
              value={seedKeywordsInput}
              onChange={(e) => setSeedKeywordsInput(e.target.value)}
              placeholder="여름, 장마, 캠핑, 휴가, 폭염, 냉방"
            />
            <button
              type="button"
              style={btnPrimary}
              onClick={() => void fetchKeywordCandidates()}
              disabled={candidatesLoading}
            >
              {candidatesLoading ? '찾는 중…' : '추천 키워드 후보 찾기'}
            </button>
          </div>
        </div>

        {candidatesError && (
          <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '12px' }}>{candidatesError}</p>
        )}
        {candidatesFailedSeeds.length > 0 && (
          <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '12px' }}>
            {candidatesFailedSeeds.join(', ')} 시드는 조회에 실패했습니다.
          </p>
        )}

        {candidates.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {candidates.map((c) => {
                const checked = selectedCandidates.has(c);
                return (
                  <label
                    key={c}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: `1px solid ${checked ? '#175cd3' : '#d0d5dd'}`,
                      background: checked ? '#eff6ff' : '#fff',
                      borderRadius: '999px',
                      padding: '4px 12px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectedCandidate(c)}
                      style={{ cursor: 'pointer' }}
                    />
                    {c}
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={btnPrimary}
                onClick={() => void fetchRecommendedReport()}
                disabled={recommendedLoading}
              >
                {recommendedLoading ? '리포트 만드는 중…' : '선택한 후보로 리포트 만들기'}
              </button>
              <span style={{ fontSize: '12px', color: '#666' }}>
                선택 {selectedCandidates.size} / 최대 {MAX_RECOMMENDED_SELECTION}개
              </span>
            </div>
          </>
        )}

        {recommendedError && (
          <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '12px' }}>{recommendedError}</p>
        )}
        {recommendedFailedKeywords.length > 0 && (
          <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '12px' }}>
            {recommendedFailedKeywords.join(', ')} 키워드는 조회에 실패했습니다.
          </p>
        )}

        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '16px', marginTop: '4px' }}>
          <div style={{ fontWeight: 700, marginBottom: '10px' }}>오늘의 상품 아이디어 TOP10</div>

          {recommendedKeywordStats.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#b45309' }}>
              추천 후보를 선택해 리포트를 만들면 TOP10 표가 표시됩니다.
            </p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', color: '#666' }}>
                      <th style={{ padding: '8px 6px' }}>순위</th>
                      <th style={{ padding: '8px 6px' }}>키워드</th>
                      <th style={{ padding: '8px 6px' }}>상품수</th>
                      <th style={{ padding: '8px 6px' }}>평균가</th>
                      <th style={{ padding: '8px 6px' }}>블로그 언급</th>
                      <th style={{ padding: '8px 6px' }}>뉴스 이슈</th>
                      <th style={{ padding: '8px 6px' }}>경쟁강도</th>
                      <th style={{ padding: '8px 6px' }}>기회점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendedKeywordStats.map((row) => (
                      <tr key={row.rank} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: '8px 6px' }}>{row.rank}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.keyword}</td>
                        <td style={{ padding: '8px 6px' }}>{row.productCount.toLocaleString()}</td>
                        <td style={{ padding: '8px 6px' }}>{row.avgPrice.toLocaleString()}원</td>
                        <td style={{ padding: '8px 6px' }}>{row.blogMentionCount.toLocaleString()}건</td>
                        <td style={{ padding: '8px 6px' }}>{row.newsIssueCount.toLocaleString()}건</td>
                        <td style={{ padding: '8px 6px' }}>{row.competitionScore}</td>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.opportunityScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
                경쟁강도와 기회점수는 네이버 검색 API 요약값을 바탕으로 한 내부 참고 점수입니다.
              </p>
              {recommendedFetchedAt && (
                <p style={{ fontSize: '12px', color: '#999' }}>조회 시각: {formatDateTime(recommendedFetchedAt)}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ③ 키워드 TOP 10 — 조회된 참고 데이터(previewResults) 기반 실계산, DB 저장 없는 순수 계산 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>키워드 TOP 10</div>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '14px' }}>
          이 표는 네이버 검색 API 기준 실시간 참고 지표입니다. 판매량·매출·거래량이 아니라 쇼핑 검색 결과,
          블로그/뉴스 검색 결과를 바탕으로 계산한 참고용 점수입니다.
        </p>

        {keywordStats.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#b45309' }}>
            참고 데이터를 먼저 가져오면 TOP10 표가 표시됩니다.
          </p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e5e5', color: '#666' }}>
                    <th style={{ padding: '8px 6px' }}>순위</th>
                    <th style={{ padding: '8px 6px' }}>키워드</th>
                    <th style={{ padding: '8px 6px' }}>상품수</th>
                    <th style={{ padding: '8px 6px' }}>평균가</th>
                    <th style={{ padding: '8px 6px' }}>블로그 언급</th>
                    <th style={{ padding: '8px 6px' }}>뉴스 이슈</th>
                    <th style={{ padding: '8px 6px' }}>경쟁강도</th>
                    <th style={{ padding: '8px 6px' }}>기회점수</th>
                  </tr>
                </thead>
                <tbody>
                  {keywordStats.map((row) => (
                    <tr key={row.rank} style={{ borderBottom: '1px solid #f2f2f2' }}>
                      <td style={{ padding: '8px 6px' }}>{row.rank}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.keyword}</td>
                      <td style={{ padding: '8px 6px' }}>{row.productCount.toLocaleString()}</td>
                      <td style={{ padding: '8px 6px' }}>{row.avgPrice.toLocaleString()}원</td>
                      <td style={{ padding: '8px 6px' }}>{row.blogMentionCount.toLocaleString()}건</td>
                      <td style={{ padding: '8px 6px' }}>{row.newsIssueCount.toLocaleString()}건</td>
                      <td style={{ padding: '8px 6px' }}>{row.competitionScore}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{row.opportunityScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '10px' }}>
              경쟁강도와 기회점수는 네이버 검색 API 요약값을 바탕으로 한 내부 참고 점수입니다.
            </p>
          </>
        )}
      </div>

      {/* ④~⑥ 뉴스레터 생성 · 미리보기 · 복사 */}
      <div style={sectionCard}>
        <div style={sectionTitle}>뉴스레터 생성</div>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
          위 &ldquo;오늘 참고 데이터&rdquo; 요약값과 설정(금지 표현·광고 문구·문체)을 바탕으로 AI가 초안을 만듭니다.
          결과는 화면에만 표시되고 저장되지 않으며, 새로고침하면 사라집니다.
        </p>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={btnPrimary}
            onClick={() => void handleGenerate()}
            disabled={generating || previewResults.length === 0}
          >
            {generating ? '생성 중…' : '참고 데이터로 초안 만들기'}
          </button>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => void handleGenerate()}
            disabled={generating || previewResults.length === 0 || draft.status !== 'DRAFT'}
          >
            재생성
          </button>
          <span style={{ fontSize: '13px', color: '#666' }}>
            상태: {draft.status === 'DRAFT' ? 'draft 있음' : 'draft 없음'}
          </span>
        </div>

        {previewResults.length === 0 && (
          <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '12px' }}>
            먼저 오늘 참고 데이터를 조회해 주세요.
          </p>
        )}

        {draftError && (
          <p style={{ fontSize: '13px', color: '#b91c1c', marginBottom: '12px' }}>{draftError}</p>
        )}

        {draft.status === 'DRAFT' && bannedWordsFound.length > 0 && (
          <div
            style={{
              fontSize: '13px',
              color: '#991b1b',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '10px 12px',
              marginBottom: '12px',
              fontWeight: 600,
            }}
          >
            주의: 금지 표현이 포함되어 있습니다. 복사하기 전에 반드시 수정해 주세요.
            <div style={{ fontWeight: 400, marginTop: '4px' }}>감지된 표현: {bannedWordsFound.join(', ')}</div>
          </div>
        )}

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
