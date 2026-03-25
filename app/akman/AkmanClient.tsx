'use client';

import { useSession } from 'next-auth/react';

export default function AkmanClient() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div>로딩중...</div>;

  const email = (session?.user?.email || '').trim().toLowerCase();

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // 브라우저 콘솔에서 실제 비교값 확인(권한 없음일 때 디버깅용)
  // eslint-disable-next-line no-console
  console.log('[AkmanClient] session email:', email, 'adminEmails:', adminEmails);

  const isAdmin = adminEmails.includes(email);

  if (!isAdmin) return <div>관리자 권한 없음</div>;

  return <div>관리자 페이지</div>;
}

