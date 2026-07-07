import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';
import { EXCLOAD_MAKESHOP_OUTBOUND_IP } from '@/app/lib/makeshop/api-spec';
import { isMakeshopOAuthConfigured } from '@/app/lib/makeshop/oauth-credentials';

/** 관리자 전용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const transport = getIntegrationTransportInfo();

  return NextResponse.json({
    success: true,
    transport,
    oauthConfigured: isMakeshopOAuthConfigured(),
    outboundIp: EXCLOAD_MAKESHOP_OUTBOUND_IP,
    notes:
      transport.mode === 'proxy'
        ? `고정 IP 프록시 모드입니다. 메이크샵 APP 접근 허용 IP(${EXCLOAD_MAKESHOP_OUTBOUND_IP}) 등록이 필요하며, Lightsail allowed-hosts는 몰 정리 후 1회 반영 예정입니다.`
        : '프록시가 설정되지 않았습니다. 메이크샵 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
