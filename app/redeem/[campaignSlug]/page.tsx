import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { RedeemClient } from '@/app/redeem/RedeemClient';
import { getCampaignBySlug, isCampaignRedeemable } from '@/app/lib/voucher/campaign';

type Props = { params: Promise<{ campaignSlug: string }> };

export default async function RedeemCampaignPage({ params }: Props) {
  const { campaignSlug } = await params;
  const campaign = await getCampaignBySlug(campaignSlug);
  if (!campaign) notFound();

  const redeemCheck = isCampaignRedeemable(campaign);
  const showCampaignHint = campaignSlug === 'wadiz-2026-01';

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-sm text-zinc-600">불러오는 중…</div>
      }
    >
      <RedeemClient
        campaignSlug={campaign.slug}
        campaignTitle={campaign.title}
        redeemBlockedMessage={redeemCheck.ok ? null : redeemCheck.message}
        showCampaignHint={showCampaignHint}
      />
    </Suspense>
  );
}
