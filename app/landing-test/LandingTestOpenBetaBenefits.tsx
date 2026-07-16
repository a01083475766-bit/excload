'use client';

import { OpenBetaBenefitsAndJoin } from '@/app/components/landing/OpenBetaLandingSections';
import { isOpenBetaMode } from '@/app/lib/open-beta-policy';

/** /landing-test — 운영 랜딩과 동일한 혜택·참여 밴드 */
export default function LandingTestOpenBetaBenefits() {
  if (!isOpenBetaMode()) return null;
  return <OpenBetaBenefitsAndJoin />;
}
