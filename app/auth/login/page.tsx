/**
 * 로그인 페이지 (/auth/login → /auth?mode=login 호환)
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 서버에서 세션·쿼리를 확인해 클라이언트 2-hop 깜빡임을 제거합니다.
 */

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import {
  buildAuthLoginRedirectUrl,
  getPostLoginPath,
} from '@/app/lib/auth/post-login-redirect';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }
  params.set('mode', 'login');

  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(getPostLoginPath(params));
  }

  redirect(`/auth?${params.toString()}`);
}
