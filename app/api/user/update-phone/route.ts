import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isValidKoreanPhoneDigits, normalizeKoreanPhoneDigits } from '@/app/lib/phone-kr';

interface UpdatePhoneBody {
  phone?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = (await request.json()) as UpdatePhoneBody;
    const phoneDigits = normalizeKoreanPhoneDigits(String(body.phone || ''));
    if (!isValidKoreanPhoneDigits(phoneDigits)) {
      return NextResponse.json(
        { error: '휴대폰 번호는 10~11자리 숫자(010, 011 등) 형식으로 입력해주세요.' },
        { status: 400 }
      );
    }

    try {
      const updated = await prisma.user.update({
        where: { email: session.user.email },
        data: { phone: phoneDigits },
        select: { id: true, email: true, phone: true },
      });
      return NextResponse.json({
        success: true,
        user: updated,
      });
    } catch (dbError: any) {
      if (dbError?.code === 'P2002') {
        return NextResponse.json(
          { error: '이미 가입에 사용된 휴대폰 번호입니다.' },
          { status: 400 }
        );
      }
      throw dbError;
    }
  } catch (error) {
    console.error('[User Update Phone API] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '휴대폰 번호 저장 실패' },
      { status: 500 }
    );
  }
}
