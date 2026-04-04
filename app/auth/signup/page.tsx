/**
 * 회원가입 페이지 (리다이렉트)
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 인증 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 *
 * 통합 인증 페이지(/auth)로 리다이렉트합니다.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth?mode=signup');
  }, [router]);

  return null;
}
