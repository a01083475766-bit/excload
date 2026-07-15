import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';

/** 로그인 사용자용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const transport = getIntegrationTransportInfo();

  return NextResponse.json({
    success: true,
    transport,
    notes:
      transport.mode === 'proxy'
        ? '고정 IP 프록시 모드입니다. 11번가 OPEN API CENTER에는 프록시 서버 outbound IP를 등록하세요.'
        : '프록시가 설정되지 않았습니다. 11번가 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
