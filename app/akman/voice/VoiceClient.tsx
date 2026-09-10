'use client';

/**
 * 관리자 전용 AI 캐릭터 독백 음성 제작기
 * 주문 변환 파이프라인과 독립. Fun-CosyVoice3는 별도 GPU Worker에서만 실행.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  VOICE_REF_MAX_DURATION_SECONDS,
  VOICE_REF_RECOMMENDED_DURATION,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_TEXT_MAX_CHARS,
} from '@/app/lib/akman-voice/constants';

type VoiceProfile = {
  id: string;
  name: string;
  referenceOriginalName: string;
  referenceMimeType: string;
  referenceDurationSeconds: number | null;
  promptText: string;
  defaultInstruction: string | null;
  defaultSpeed: number;
  createdAt: string;
  updatedAt: string;
};

type VoiceGeneration = {
  id: string;
  voiceProfileId: string;
  voiceProfileName: string | null;
  text: string;
  instruction: string | null;
  speed: number;
  status: string;
  errorMessage: string | null;
  hasAudio: boolean;
  createdAt: string;
  updatedAt: string;
};

type VoiceServiceStatus = {
  configured: boolean;
  url: string | null;
};

const shell: React.CSSProperties = {
  padding: '40px',
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '920px',
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  marginBottom: '6px',
  color: '#333',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: '8px',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '110px',
  resize: 'vertical',
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '8px',
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#fff',
  color: '#111',
};

const mutedStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '0.85rem',
  lineHeight: 1.5,
};

const NEW_PROFILE = '__new__';

async function readAudioDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

export default function VoiceClient() {
  const pathname = usePathname();
  const homeHref = pathname?.startsWith('/admin') ? '/admin' : '/akman';

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [voiceService, setVoiceService] = useState<VoiceServiceStatus>({
    configured: false,
    url: null,
  });
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProfileId, setSelectedProfileId] = useState<string>(NEW_PROFILE);
  const [name, setName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [defaultInstruction, setDefaultInstruction] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [generateProfileId, setGenerateProfileId] = useState('');
  const [monologueText, setMonologueText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [speed, setSpeed] = useState(VOICE_SPEED_DEFAULT);
  const [generating, setGenerating] = useState(false);
  const [latestGeneration, setLatestGeneration] = useState<VoiceGeneration | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/akman/voice/profiles', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || '캐릭터 목록을 불러오지 못했습니다.');
      }
      const list = (json.profiles ?? []) as VoiceProfile[];
      setProfiles(list);
      setVoiceService(json.voiceService ?? { configured: false, url: null });
      setStorageConfigured(Boolean(json.storageConfigured));
      if (list.length > 0) {
        setSelectedProfileId((prev) =>
          prev !== NEW_PROFILE && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
        setGenerateProfileId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedProfileId(NEW_PROFILE);
        setGenerateProfileId('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '캐릭터 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (!selectedProfile) {
      if (selectedProfileId === NEW_PROFILE) {
        setName('');
        setPromptText('');
        setDefaultInstruction('');
        setReferenceFile(null);
      }
      return;
    }
    setName(selectedProfile.name);
    setPromptText(selectedProfile.promptText);
    setDefaultInstruction(selectedProfile.defaultInstruction ?? '');
    setReferenceFile(null);
    setGenerateProfileId(selectedProfile.id);
    setInstruction(selectedProfile.defaultInstruction ?? '');
    setSpeed(selectedProfile.defaultSpeed || VOICE_SPEED_DEFAULT);
  }, [selectedProfile, selectedProfileId]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    setError(null);
    try {
      if (selectedProfileId === NEW_PROFILE) {
        if (!referenceFile) {
          throw new Error('참조 음성 파일이 필요합니다.');
        }
        const durationSeconds = await readAudioDurationSeconds(referenceFile);
        if (
          typeof durationSeconds === 'number' &&
          durationSeconds > VOICE_REF_MAX_DURATION_SECONDS
        ) {
          throw new Error(
            `참조 음성은 ${VOICE_REF_MAX_DURATION_SECONDS}초 이하로 등록해주세요. (권장 ${VOICE_REF_RECOMMENDED_DURATION})`,
          );
        }
        const form = new FormData();
        form.append('name', name);
        form.append('promptText', promptText);
        form.append('defaultInstruction', defaultInstruction);
        form.append('defaultSpeed', String(VOICE_SPEED_DEFAULT));
        if (durationSeconds != null) {
          form.append('durationSeconds', String(durationSeconds));
        }
        form.append('referenceAudio', referenceFile);
        const res = await fetch('/api/akman/voice/profiles', { method: 'POST', body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '캐릭터 저장에 실패했습니다.');
        await loadProfiles();
        setSelectedProfileId(json.profile.id);
        setGenerateProfileId(json.profile.id);
      } else {
        const res = await fetch(`/api/akman/voice/profiles/${selectedProfileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            promptText,
            defaultInstruction,
            defaultSpeed: selectedProfile?.defaultSpeed ?? VOICE_SPEED_DEFAULT,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '캐릭터 수정에 실패했습니다.');
        await loadProfiles();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '캐릭터 저장에 실패했습니다.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDeleteProfile() {
    if (!selectedProfile) return;
    if (!window.confirm(`캐릭터 "${selectedProfile.name}"을(를) 삭제할까요?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/akman/voice/profiles/${selectedProfile.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '캐릭터 삭제에 실패했습니다.');
      setLatestGeneration(null);
      await loadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : '캐릭터 삭제에 실패했습니다.');
    }
  }

  async function handleGenerate() {
    if (!generateProfileId) {
      setError('캐릭터를 선택해주세요.');
      return;
    }
    if (!voiceService.configured) {
      setError('GPU 음성 엔진이 아직 설정되지 않았습니다.');
      return;
    }
    setGenerating(true);
    setError(null);
    setLatestGeneration(null);
    try {
      const res = await fetch('/api/akman/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceProfileId: generateProfileId,
          text: monologueText,
          instruction,
          speed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '음성 생성 중 오류가 발생했습니다.');
      setLatestGeneration(json.generation as VoiceGeneration);
    } catch (e) {
      setError(e instanceof Error ? e.message : '음성 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  const audioSrc = latestGeneration?.hasAudio
    ? `/api/akman/voice/generations/${latestGeneration.id}/download?inline=1`
    : null;

  return (
    <div style={shell}>
      <div style={{ marginBottom: '16px' }}>
        <Link href={homeHref} style={{ color: '#666', fontSize: '0.9rem' }}>
          ← 관리자 홈
        </Link>
      </div>
      <h1 style={{ marginBottom: '8px', fontSize: '1.5rem' }}>캐릭터 독백 음성</h1>
      <p style={{ ...mutedStyle, marginBottom: '20px' }}>
        영화·드라마 장면에 넣을 인물 속마음/독백 WAV를 만듭니다. 일반 나레이션용이 아닙니다.
      </p>

      {!voiceService.configured && (
        <div
          style={{
            background: '#fff8e6',
            border: '1px solid #f0d78c',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            color: '#7a5b00',
            fontSize: '0.9rem',
          }}
        >
          음성 엔진이 연결되어 있지 않습니다. 캐릭터 저장은 가능하지만 독백 생성은 GPU Voice Worker
          (`VOICE_SERVICE_URL`) 설정 후 사용할 수 있습니다.
        </div>
      )}

      {!storageConfigured && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            color: '#991b1b',
            fontSize: '0.9rem',
          }}
        >
          음성 파일 저장소가 설정되지 않았습니다. `VOICE_STORAGE_BUCKET`과 Supabase 설정을
          확인해주세요.
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px',
            color: '#991b1b',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={mutedStyle}>불러오는 중…</p>
      ) : (
        <>
          <section style={sectionCard}>
            <div style={sectionTitle}>A. 캐릭터 프로필</div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>캐릭터 선택</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  style={{ ...inputStyle, maxWidth: '360px' }}
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                >
                  <option value={NEW_PROFILE}>새로운 캐릭터 만들기</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setSelectedProfileId(NEW_PROFILE)}
                >
                  새 캐릭터
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>캐릭터 이름</label>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 여성 독백 A"
                maxLength={80}
              />
            </div>

            {selectedProfileId === NEW_PROFILE && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>참조 음성 파일</label>
                <input
                  type="file"
                  accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4"
                  onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                />
                <p style={{ ...mutedStyle, marginTop: '8px' }}>
                  권장: {VOICE_REF_RECOMMENDED_DURATION} 정도의 깨끗한 단일 화자 음성.
                  최대 {VOICE_REF_MAX_DURATION_SECONDS}초 (WAV/MP3/M4A). CosyVoice zero-shot은
                  참조음이 길수록 오히려 불안정해질 수 있습니다.
                </p>
              </div>
            )}

            {selectedProfile && (
              <p style={{ ...mutedStyle, marginBottom: '14px' }}>
                등록된 참조 음성: {selectedProfile.referenceOriginalName}
                {selectedProfile.referenceDurationSeconds != null
                  ? ` (${selectedProfile.referenceDurationSeconds.toFixed(1)}초)`
                  : ''}
              </p>
            )}

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>참조 음성 실제 대사</label>
              <textarea
                style={textareaStyle}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder='예: "밖에 나가게 돼도 딴생각은 하지 말아요."'
              />
              <p style={{ ...mutedStyle, marginTop: '6px' }}>
                CosyVoice zero-shot prompt text로 사용됩니다. 참조음에 실제로 들리는 문장을
                적어주세요.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>기본 연기 지시 (선택)</label>
              <textarea
                style={{ ...textareaStyle, minHeight: '80px' }}
                value={defaultInstruction}
                onChange={(e) => setDefaultInstruction(e.target.value)}
                placeholder="예: 조용하고 낮은 목소리로, 혼자 생각하듯 천천히 말한다."
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={buttonStyle}
                disabled={savingProfile || !storageConfigured}
                onClick={() => void handleSaveProfile()}
              >
                {savingProfile ? '저장 중…' : '캐릭터 저장'}
              </button>
              {selectedProfile && (
                <button type="button" style={secondaryButtonStyle} onClick={() => void handleDeleteProfile()}>
                  삭제
                </button>
              )}
            </div>
          </section>

          <section style={sectionCard}>
            <div style={sectionTitle}>B. 독백 생성</div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>캐릭터</label>
              <select
                style={{ ...inputStyle, maxWidth: '360px' }}
                value={generateProfileId}
                onChange={(e) => setGenerateProfileId(e.target.value)}
              >
                <option value="">선택</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>새 독백</label>
              <textarea
                style={{ ...textareaStyle, minHeight: '140px' }}
                value={monologueText}
                onChange={(e) => setMonologueText(e.target.value)}
                maxLength={VOICE_TEXT_MAX_CHARS}
                placeholder={
                  '이상하지.\n분명 다 끝났다고 생각했는데...\n왜 자꾸 그 사람이 생각나는 걸까.'
                }
              />
              <p style={mutedStyle}>
                {monologueText.length}/{VOICE_TEXT_MAX_CHARS}자 · `[breath]` / `[sigh]` 태그는
                텍스트에 직접 넣어도 됩니다.
              </p>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>연기 지시 (선택)</label>
              <textarea
                style={{ ...textareaStyle, minHeight: '80px' }}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="비워두면 zero-shot만 사용합니다. 입력 시 instruct2로 전달됩니다."
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>
                속도 ({VOICE_SPEED_MIN} ~ {VOICE_SPEED_MAX})
              </label>
              <input
                type="number"
                min={VOICE_SPEED_MIN}
                max={VOICE_SPEED_MAX}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                style={{ ...inputStyle, maxWidth: '140px' }}
              />
            </div>

            <button
              type="button"
              style={{
                ...buttonStyle,
                opacity: generating || !voiceService.configured || !generateProfileId ? 0.55 : 1,
                cursor:
                  generating || !voiceService.configured || !generateProfileId
                    ? 'not-allowed'
                    : 'pointer',
              }}
              disabled={generating || !voiceService.configured || !generateProfileId}
              onClick={() => void handleGenerate()}
            >
              {generating ? '음성을 생성하고 있습니다…' : '독백 생성'}
            </button>
          </section>

          <section style={sectionCard}>
            <div style={sectionTitle}>C. 결과</div>
            {!latestGeneration && <p style={mutedStyle}>아직 생성된 음성이 없습니다.</p>}
            {latestGeneration && (
              <>
                <p style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                  <strong>{latestGeneration.voiceProfileName || '캐릭터'}</strong>
                  {' · '}
                  {new Date(latestGeneration.createdAt).toLocaleString('ko-KR')}
                  {' · '}
                  {latestGeneration.status}
                </p>
                <p style={{ ...mutedStyle, marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                  {latestGeneration.text.slice(0, 200)}
                  {latestGeneration.text.length > 200 ? '…' : ''}
                </p>
                {latestGeneration.errorMessage && (
                  <p style={{ color: '#991b1b', marginBottom: '12px' }}>
                    {latestGeneration.errorMessage}
                  </p>
                )}
                {audioSrc && (
                  <>
                    <audio controls src={audioSrc} style={{ width: '100%', marginBottom: '12px' }} />
                    <a
                      href={`/api/akman/voice/generations/${latestGeneration.id}/download`}
                      style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none' }}
                    >
                      WAV 다운로드
                    </a>
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
