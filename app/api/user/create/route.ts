/**
 * 사용자 생성 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 사용자 DB는 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/user/create
 * 회원가입 시 사용자 생성
 */
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: 'Deprecated endpoint. Use /api/auth/signup/request and /api/auth/signup/confirm.',
    },
    { status: 410 }
  );
}
