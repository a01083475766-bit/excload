import { Suspense } from 'react';
import { RedeemClient } from '@/app/redeem/RedeemClient';

export default function RedeemPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-sm text-zinc-600">불러오는 중…</div>
      }
    >
      <RedeemClient />
    </Suspense>
  );
}
