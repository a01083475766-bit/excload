import { LogisticsConvertClient } from '@/app/logistics-convert/LogisticsConvertClient';

/** 체험판 — 물류 주문 변환 UI와 동일, 파일 다운로드만 비활성 (네비에 비노출, 랜딩에서만 진입) */
export default function TrialPage() {
  return <LogisticsConvertClient trialMode />;
}
