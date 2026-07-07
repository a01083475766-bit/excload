import { NextResponse } from 'next/server';
import {
  isAdminAuthFailure,
  requireOrderIntegrationAdmin,
} from '@/app/lib/order-integration/admin-api-auth';
import { getIntegrationTransportInfo } from '@/app/lib/integration-proxy/config';
import { getIntegrationProxySuffixRules } from '@/app/lib/order-integration/mall-integration-specs';

/** 관리자 전용 — 주문연동 고정 IP 프록시(direct/proxy) 확인 */
export async function GET() {
  const auth = await requireOrderIntegrationAdmin();
  if (isAdminAuthFailure(auth)) return auth.response;

  const transport = getIntegrationTransportInfo();
  const suffixRules = getIntegrationProxySuffixRules();

  return NextResponse.json({
    success: true,
    transport,
    suffixRules: suffixRules.map((rule) => rule.suffix),
    notes:
      transport.mode === 'proxy'
        ? '고정 IP 프록시 모드입니다. 카페24 API는 {mallId}.cafe24api.com suffix 허용(코드) — Lightsail 1회 반영 대기.'
        : '프록시가 설정되지 않았습니다. 카페24 API 호출은 고정 IP 프록시가 필요합니다.',
  });
}
