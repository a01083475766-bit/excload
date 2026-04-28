'use client';

import { useEffect } from 'react';

/**
 * 브라우저 콘솔 일반 로그를 전역 비활성화합니다.
 * 에러 추적을 위해 warn/error는 유지합니다.
 */
export default function ClientConsoleSilencer() {
  useEffect(() => {
    const noop = () => {};
    console.log = noop;
    console.info = noop;
    console.debug = noop;
  }, []);

  return null;
}
