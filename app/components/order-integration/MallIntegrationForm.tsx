'use client';

import { Suspense } from 'react';
import { CoupangIntegrationForm } from '@/app/components/order-integration/CoupangIntegrationForm';
import { Cafe24IntegrationForm } from '@/app/components/order-integration/Cafe24IntegrationForm';
import { ElevenIntegrationForm } from '@/app/components/order-integration/ElevenIntegrationForm';
import { LotteonIntegrationForm } from '@/app/components/order-integration/LotteonIntegrationForm';
import { SsgIntegrationForm } from '@/app/components/order-integration/SsgIntegrationForm';
import { SmartstoreIntegrationForm } from '@/app/components/order-integration/SmartstoreIntegrationForm';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

type Props = {
  mallId: Extract<OrderIntegrationMallId, 'coupang' | 'eleven' | 'smartstore' | 'cafe24' | 'lotteon' | 'ssg'>;
  mallName: string;
};

export function MallIntegrationForm({ mallId }: Props) {
  if (mallId === 'coupang') {
    return <CoupangIntegrationForm />;
  }

  if (mallId === 'smartstore') {
    return <SmartstoreIntegrationForm />;
  }

  if (mallId === 'cafe24') {
    return (
      <Suspense fallback={<p className="px-4 py-6 text-sm text-zinc-500">카페24 연동 화면 불러오는 중…</p>}>
        <Cafe24IntegrationForm />
      </Suspense>
    );
  }

  if (mallId === 'lotteon') {
    return <LotteonIntegrationForm />;
  }

  if (mallId === 'ssg') {
    return <SsgIntegrationForm />;
  }

  return <ElevenIntegrationForm />;
}
