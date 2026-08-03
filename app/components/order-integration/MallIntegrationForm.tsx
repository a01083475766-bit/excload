'use client';

import { Suspense } from 'react';
import { CoupangIntegrationForm } from '@/app/components/order-integration/CoupangIntegrationForm';
import { Cafe24IntegrationForm } from '@/app/components/order-integration/Cafe24IntegrationForm';
import { ElevenIntegrationForm } from '@/app/components/order-integration/ElevenIntegrationForm';
import { CjonstyleIntegrationForm } from '@/app/components/order-integration/CjonstyleIntegrationForm';
import { GodomallIntegrationForm } from '@/app/components/order-integration/GodomallIntegrationForm';
import { MakeshopIntegrationForm } from '@/app/components/order-integration/MakeshopIntegrationForm';
import { DomeggookIntegrationForm } from '@/app/components/order-integration/DomeggookIntegrationForm';
import { ShopbyIntegrationForm } from '@/app/components/order-integration/ShopbyIntegrationForm';
import { LotteonIntegrationForm } from '@/app/components/order-integration/LotteonIntegrationForm';
import { SsgIntegrationForm } from '@/app/components/order-integration/SsgIntegrationForm';
import { SmartstoreIntegrationForm } from '@/app/components/order-integration/SmartstoreIntegrationForm';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

type Props = {
  mallId: Extract<
    OrderIntegrationMallId,
    | 'coupang'
    | 'eleven'
    | 'smartstore'
    | 'cafe24'
    | 'lotteon'
    | 'ssg'
    | 'cjonstyle'
    | 'shopby'
    | 'godomall'
    | 'makeshop'
    | 'domeggook'
  >;
  mallName: string;
  embedded?: boolean;
  /** 저장/연결 해제 등으로 DB 연결 상태가 바뀌었을 때 상위 목록 갱신용 */
  onConnectionChange?: () => void;
};

export function MallIntegrationForm({ mallId, embedded = false, onConnectionChange }: Props) {
  if (mallId === 'coupang') {
    return <CoupangIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'smartstore') {
    return <SmartstoreIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'cafe24') {
    return (
      <Suspense fallback={<p className="px-4 py-6 text-sm text-zinc-500">카페24 연동 화면 불러오는 중…</p>}>
        <Cafe24IntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />
      </Suspense>
    );
  }

  if (mallId === 'lotteon') {
    return <LotteonIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'ssg') {
    return <SsgIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'cjonstyle') {
    return <CjonstyleIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'shopby') {
    return <ShopbyIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'godomall') {
    return <GodomallIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'makeshop') {
    return <MakeshopIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  if (mallId === 'domeggook') {
    return <DomeggookIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
  }

  return <ElevenIntegrationForm embedded={embedded} onConnectionChange={onConnectionChange} />;
}
