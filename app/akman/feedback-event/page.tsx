'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type Config = {
  isEnabled: boolean;
  isActive: boolean;
  endsAt: string;
  endsAtLabel: string;
};

export default function AkmanFeedbackEventPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [endsAtInput, setEndsAtInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/akman/feedback-event', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endsAt: endsAtInput ? new Date(endsAtInput).toISOString() : undefined,
          isEnabled: config?.isEnabled ?? true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '저장 실패');
        return;
      }
      setConfig(data.config);
      alert('저장되었습니다. 마감 시 네비·팝업·접수가 자동으로 중단됩니다.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/akman/feedback-event', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: enabled }),
      });
      const data = await res.json();
      if (res.ok) setConfig(data.config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/akman" className="text-sm text-blue-600 hover:underline">
        ← 관리자 홈
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">오픈 피드백 이벤트</h1>
      <p className="text-sm text-gray-600 mb-6">
        마감일이 지나거나 비활성화하면 네비게이션·다운로드 팝업·접수가 자동으로 중단되고 기존
        화면으로 돌아갑니다.
      </p>

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
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void toggleEnabled(true)}
                className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white"
              >
                활성화
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void toggleEnabled(false)}
                className="px-3 py-1.5 text-sm rounded bg-gray-200"
              >
                즉시 비활성화
              </button>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-white space-y-3">
            <label className="block text-sm font-medium">마감 일시 (로컬 시간)</label>
            <input
              type="datetime-local"
              value={endsAtInput}
              onChange={(e) => setEndsAtInput(e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full max-w-xs"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="block px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium"
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
