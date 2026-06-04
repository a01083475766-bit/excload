'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Config = {
  isEnabled: boolean;
  isActive: boolean;
  endsAt: string;
  endsAtLabel: string;
};

export default function AkmanFeedbackEventPage() {
  const pathname = usePathname();
  const adminHome = pathname?.startsWith('/admin') ? '/admin' : '/akman';

  const [config, setConfig] = useState<Config | null>(null);
  const [endsAtInput, setEndsAtInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/akman/feedback-event', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfig(data.config);
        const d = new Date(data.config.endsAt);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setEndsAtInput(local);
      } else {
        setConfig(null);
        setMessage(data.error || '설정을 불러오지 못했습니다.');
      }
    } catch {
      setConfig(null);
      setMessage('설정을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchConfig = async (body: Record<string, unknown>) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/akman/feedback-event', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const err = data.error || '저장 실패';
        setMessage(err);
        window.alert(err);
        return false;
      }
      setConfig(data.config);
      return true;
    } catch {
      const err = '저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      setMessage(err);
      window.alert(err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const ok = await patchConfig({
      endsAt: endsAtInput ? new Date(endsAtInput).toISOString() : undefined,
      isEnabled: config?.isEnabled ?? true,
    });
    if (ok) {
      setMessage('저장되었습니다. 마감 시 네비·팝업·접수가 자동으로 중단됩니다.');
      await load();
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    const ok = await patchConfig({ isEnabled: enabled });
    if (ok) {
      setMessage(enabled ? '이벤트가 활성화되었습니다.' : '이벤트가 비활성화되었습니다.');
    }
  };

  const btnClass =
    'px-3 py-1.5 text-sm rounded font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

  return (
    <div className="relative z-[1] p-6 max-w-4xl mx-auto">
      <Link href={adminHome} className="text-sm text-blue-600 hover:underline">
        ← 관리자 홈
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">오픈 피드백 이벤트</h1>
      <p className="text-sm text-gray-600 mb-6">
        마감일이 지나거나 비활성화하면 네비게이션·다운로드 팝업·접수가 자동으로 중단되고 기존
        화면으로 돌아갑니다.
      </p>

      {message && (
        <p
          className={`mb-4 text-sm rounded-lg border px-3 py-2 ${
            message.includes('실패') || message.includes('오류') || message.includes('못')
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
          role="status"
        >
          {message}
        </p>
      )}

      {loading ? (
        <p>불러오는 중…</p>
      ) : config ? (
        <div className="space-y-6">
          <div className="rounded-lg border p-4 bg-white">
            <p className="text-sm">
              상태:{' '}
              <strong className={config.isActive ? 'text-emerald-700' : 'text-gray-600'}>
                {config.isActive ? '진행 중' : '종료/비활성'}
              </strong>
            </p>
            <p className="text-sm mt-1">마감(표시): {config.endsAtLabel}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void toggleEnabled(true)}
                className={`${btnClass} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                활성화
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void toggleEnabled(false)}
                className={`${btnClass} bg-gray-200 text-gray-900 hover:bg-gray-300`}
              >
                즉시 비활성화
              </button>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-white space-y-3">
            <label className="block text-sm font-medium" htmlFor="feedback-event-ends-at">
              마감 일시 (로컬 시간)
            </label>
            <input
              id="feedback-event-ends-at"
              type="datetime-local"
              value={endsAtInput}
              onChange={(e) => setEndsAtInput(e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full max-w-xs"
            />
            <button
              type="button"
              disabled={saving || !endsAtInput}
              onClick={() => void save()}
              className={`${btnClass} px-4 py-2 bg-blue-600 text-white hover:bg-blue-700`}
            >
              {saving ? '저장 중…' : '마감일 저장'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-red-600">설정을 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
