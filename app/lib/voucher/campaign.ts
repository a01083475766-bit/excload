import { prisma } from '@/app/lib/prisma';
import { CAMPAIGN_STATUS } from '@/app/lib/voucher/constants';

export async function getCampaignBySlug(slug: string) {
  return prisma.voucherCampaign.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      providerCode: true,
      redeemFrom: true,
      redeemUntil: true,
      serviceGaAt: true,
      fulfillmentFrom: true,
      fulfillmentTo: true,
    },
  });
}

export function isCampaignRedeemable(
  campaign: { status: string; redeemFrom: Date | null; redeemUntil: Date | null },
  now = new Date(),
): { ok: true } | { ok: false; message: string } {
  if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
    return { ok: false, message: '현재 등록할 수 없는 이용권입니다.' };
  }
  if (campaign.redeemFrom && now.getTime() < campaign.redeemFrom.getTime()) {
    return { ok: false, message: '아직 이용권 등록 기간이 시작되지 않았습니다.' };
  }
  if (campaign.redeemUntil && now.getTime() >= campaign.redeemUntil.getTime()) {
    return { ok: false, message: '이용권 등록 기간이 종료되었습니다.' };
  }
  return { ok: true };
}

/** sa***@naver.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `${local[0] ?? '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
