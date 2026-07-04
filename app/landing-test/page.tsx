import type { Metadata } from 'next';
import LandingTestClient from './LandingTestClient';

/** 관리자 전용 테스트 페이지 — 검색엔진 노출 방지 */
export const metadata: Metadata = {
  title: '랜딩페이지 테스트 (관리자 전용) | 엑클로드',
  robots: { index: false, follow: false },
};

export default function LandingTestPage() {
  return <LandingTestClient />;
}
