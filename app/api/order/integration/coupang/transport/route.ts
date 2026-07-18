import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getCoupangTransportInfo } from '@/app/lib/coupang/transport/resolve-transport';
import { toPublicTransportDto } from '@/app/lib/order-integration/public-api-safety';

/** 로그인 사용자용 — 현재 쿠팡 API 호출 경로(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const transport = toPublicTransportDto(getCoupangTransportInfo());

  return NextResponse.json({
    success: true,
    transport,
    notes:
      transport.mode === 'direct'
        ? '쿠팡 API를 직접 연결하는 모드입니다.'
        : '쿠팡 API 연결 준비가 완료되었습니다.',
  });
}
