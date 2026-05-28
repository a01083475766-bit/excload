'use client';

import { useEffect } from 'react';

/**
 * 운영 환경에서 브라우저 콘솔 출력을 전역 비활성화합니다.
 * 개발 환경에서는 기존 로그를 유지합니다.
 */
export default function ClientConsoleSilencer() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    const noop = () => {};
    const original = {
      log: console.log,
      info: console.info,
      debug: console.debug,
      warn: console.warn,
      error: console.error,
    };

    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.warn = noop;
    console.error = noop;

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.debug = original.debug;
      console.warn = original.warn;
      console.error = original.error;
    };
  }, []);

  return null;
}
