'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * next-auth 세션을 클라이언트 트리에 제공합니다.
 * Google OAuth 등으로 로그인한 뒤에도 useSession으로 상태를 알 수 있습니다.
 */
export default function AuthProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
