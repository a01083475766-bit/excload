/**
 * @deprecated UI 미사용. 텍스트 변환·차감은 클라이언트 + /api/user/use-points + /api/ai-gateway 를 사용합니다.
 */

import { NextResponse } from 'next/server';

const GONE_BODY = {
  error: 'This endpoint is deprecated. Use /api/ai-gateway and /api/user/use-points.',
  code: 'GONE',
};

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
