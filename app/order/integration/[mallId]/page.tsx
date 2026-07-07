'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getOrderIntegrationMall } from '@/app/lib/order-integration/malls';
import { MallIntegrationForm } from '@/app/components/order-integration/MallIntegrationForm';

export default function OrderIntegrationMallPage() {
  const params = useParams<{ mallId: string }>();
  const mallId = params?.mallId ?? '';
  const mall = mallId ? getOrderIntegrationMall(mallId) : undefined;

  if (!mall) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">존재하지 않는 쇼핑몰입니다.</p>
        <Link href="/order/integration" className="mt-4 inline-block text-sm font-medium text-blue-600">
          주문연동 목록으로
        </Link>
      </div>
    );
  }

  if (mall.status !== 'available') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          href="/order/integration"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" />
          주문연동 목록
        </Link>
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{mall.name}</h1>
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          {mall.description}
          <span className="mt-2 block font-semibold text-zinc-800 dark:text-zinc-200">현재 자동연동 준비중입니다.</span>
        </p>
      </div>
    );
  }

  if (
    mallId === 'coupang' ||
    mallId === 'eleven' ||
    mallId === 'smartstore' ||
    mallId === 'cafe24' ||
    mallId === 'lotteon' ||
    mallId === 'ssg' ||
    mallId === 'cjonstyle' ||
    mallId === 'shopby'
  ) {
    return (
      <div className="min-h-screen bg-zinc-50 pt-12 dark:bg-black">
        <MallIntegrationForm mallId={mallId} mallName={mall.name} />
      </div>
    );
  }

  return null;
}
