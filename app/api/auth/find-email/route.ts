/**
 * 휴대폰 번호로 가입 이메일 힌트(마스킹) 조회
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 — 인증/사용자 DB 독립
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isValidKoreanPhoneDigits,
  normalizeKoreanPhoneDigits,
} from '@/app/lib/phone-kr';

/** 로컬 파트 앞 3글자만 남기고 나머지는 * (도메인은 그대로) */
function maskEmailForHint(email: string): string {
  const t = email.trim();
  const at = t.indexOf('@');
  if (at < 1) {
    return '***@***';
  }
  const local = t.slice(0, at);
  const domain = t.slice(at + 1);
  if (local.length <= 3) {
    return `${local}@${domain}`;
  }
  return `${local.slice(0, 3)}${'*'.repeat(local.length - 3)}@${domain}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = body?.phone;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return NextResponse.json(
        { error: '휴대폰 번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const phoneDigits = normalizeKoreanPhoneDigits(String(raw));
    if (!isValidKoreanPhoneDigits(phoneDigits)) {
      return NextResponse.json(
        { error: '휴대폰 번호는 10~11자리(010, 011 등) 형식으로 입력해주세요.' },
        { status: 400 }
      );
    }

    const { prisma } = await import('@/app/lib/prisma');
    const user = await prisma.user.findUnique({
      where: { phone: phoneDigits },
      select: { email: true },
    });

    if (!user?.email) {
      return NextResponse.json(
        { error: '해당 휴대폰 번호로 가입된 계정을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      maskedEmail: maskEmailForHint(user.email),
    });
  } catch (e) {
    console.error('[find-email] POST', e);
    return NextResponse.json(
      { error: '요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
