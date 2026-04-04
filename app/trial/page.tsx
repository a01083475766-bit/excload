import { LogisticsConvertClient } from '@/app/logistics-convert/LogisticsConvertClient';
import TrialAccessGate from './TrialAccessGate';

/** 체험판 — 주문 변환 흐름 미리보기, 엑셀 다운로드는 비활성 (네비 비노출, 랜딩에서만 진입) */
export default function TrialPage() {
  /** 서버 전용. .env.local 에만 두면 로컬 빌드/실행에서만 적용(배포 환경에 넣으면 모든 방문자에게 적용됨) */
  const bypassBrowserLimit = process.env.TRIAL_BYPASS_BROWSER_LIMIT === '1';

  return (
    <TrialAccessGate bypassBrowserLimit={bypassBrowserLimit}>
      <LogisticsConvertClient trialMode />
    </TrialAccessGate>
  );
}
