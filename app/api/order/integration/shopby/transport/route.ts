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
        ? '고정 IP 프록시 모드입니다. NHN Server API 호출 IP 등록은 불필요하며, 엑클로드 구조상 고정 IP 프록시를 통해 server-api.e-ncp.com에 호출합니다.'
        : '프록시가 설정되지 않았습니다. 샵바이 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
