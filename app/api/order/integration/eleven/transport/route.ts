import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';

/** 관리자 전용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

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
