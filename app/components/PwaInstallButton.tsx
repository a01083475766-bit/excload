'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PwaInstallButtonProps = {
  className?: string;
};

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export default function PwaInstallButton({ className }: PwaInstallButtonProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installed) {
      alert('이미 엑클로드 앱이 설치되어 있습니다.');
      return;
    }

    if (!installPrompt) {
      alert('브라우저 설치 준비가 아직 안 되었거나 이미 설치된 상태입니다. Chrome/Edge 주소창 또는 메뉴의 "앱 설치"를 이용해 주세요.');
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
      setInstalled(true);
    }
  };

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      className={
        className ??
        'flex h-[38px] w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 sm:w-[200px]'
      }
    >
      {installed ? '앱 설치됨' : '엑클로드 앱 설치'}
    </button>
  );
}
