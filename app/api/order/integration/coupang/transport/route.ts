import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getCoupangTransportInfo } from '@/app/lib/coupang/transport/resolve-transport';

/** 로그인 사용자용 — 현재 쿠팡 API 호출 경로(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const transport = getCoupangTransportInfo();

  return NextResponse.json({
    success: true,
    transport,
    notes:
      transport.mode === 'direct'
        ? 'Vercel 직접 호출 모드입니다. 쿠팡 WING IP 등록이 Vercel egress IP와 일치해야 하며, 현재는 관리자 테스트 전용입니다.'
        : '고정 IP 프록시 모드입니다. 쿠팡 WING에는 프록시 서버의 outbound IP를 등록하세요.',
  });
}
