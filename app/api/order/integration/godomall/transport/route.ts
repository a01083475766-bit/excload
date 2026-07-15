import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';
import { EXCLOAD_GODOMALL_OUTBOUND_IP } from '@/app/lib/godomall/api-spec';
import { isGodomallPartnerKeyConfigured } from '@/app/lib/godomall/partner-key';

/** 로그인 사용자용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const transport = getIntegrationTransportInfo();

  return NextResponse.json({
    success: true,
    transport,
    partnerKeyConfigured: isGodomallPartnerKeyConfigured(),
    outboundIp: EXCLOAD_GODOMALL_OUTBOUND_IP,
    notes:
      transport.mode === 'proxy'
        ? `고정 IP 프록시 모드입니다. NHN openhub 호출 IP(${EXCLOAD_GODOMALL_OUTBOUND_IP}) 허용은 NHN 1:1 문의가 필요하며, Lightsail allowed-hosts는 몰 정리 후 1회 반영 예정입니다.`
        : '프록시가 설정되지 않았습니다. 고도몰 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
