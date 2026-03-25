'use client';

import { useSession } from 'next-auth/react';

export default function AkmanClient() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div>로딩중...</div>;

  const email = session?.user?.email || '';

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim());

  const isAdmin = adminEmails.includes(email);

  if (!isAdmin) return <div>관리자 권한 없음</div>;

  return <div>관리자 페이지</div>;
}

