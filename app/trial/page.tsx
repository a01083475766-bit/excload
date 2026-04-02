import { LogisticsConvertClient } from '@/app/logistics-convert/LogisticsConvertClient';
import TrialAccessGate from './TrialAccessGate';

/** 체험판 — 주문 변환 흐름 미리보기, 엑셀 다운로드는 비활성 (네비 비노출, 랜딩에서만 진입) */
export default function TrialPage() {
  return (
    <TrialAccessGate>
      <LogisticsConvertClient trialMode />
    </TrialAccessGate>
  );
}
