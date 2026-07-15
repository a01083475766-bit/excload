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
        ? '고정 IP 프록시 모드입니다. CJ온스타일 파트너시스템 API 정보관리에 직접개발 + 운영서버 IP(54.180.45.46)를 등록하세요.'
        : '프록시가 설정되지 않았습니다. CJ온스타일 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
