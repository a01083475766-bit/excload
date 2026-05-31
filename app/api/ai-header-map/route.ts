/**
 * @deprecated AI 헤더 매핑은 /api/ai-gateway (type: header-map) 또는 Stage1 서버 handleHeaderMap 을 사용합니다.
 */

import { NextResponse } from 'next/server';

const GONE_BODY = {
  error: 'This endpoint is deprecated. Use /api/ai-gateway with type header-map.',
  code: 'GONE',
};

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
