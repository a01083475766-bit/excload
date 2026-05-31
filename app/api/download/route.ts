/**
 * @deprecated UI 미사용. 다운로드는 클라이언트 XLSX + /api/user/use-points 를 사용합니다.
 */

import { NextResponse } from 'next/server';

const GONE_BODY = {
  error: 'This endpoint is deprecated. Use client-side download with /api/user/use-points.',
  code: 'GONE',
};

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
