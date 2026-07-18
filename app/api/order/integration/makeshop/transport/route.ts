import { NextResponse } from 'next/server';
import {
  isOrderIntegrationUserAuthFailure,
  requireOrderIntegrationUser,
} from '@/app/lib/order-integration/user-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';
import { isMakeshopOAuthConfigured } from '@/app/lib/makeshop/oauth-credentials';
import { toPublicTransportDto } from '@/app/lib/order-integration/public-api-safety';

/** 로그인 사용자용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationUser();
  if (isOrderIntegrationUserAuthFailure(auth)) return auth.response;

  const transport = toPublicTransportDto(getIntegrationTransportInfo());

  return NextResponse.json({
    success: true,
    transport,
    oauthConfigured: isMakeshopOAuthConfigured(),
    notes:
      transport.mode === 'proxy'
        ? '메이크샵 API 연결 준비가 완료되었습니다.'
        : '프록시가 설정되지 않았습니다. 메이크샵 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
