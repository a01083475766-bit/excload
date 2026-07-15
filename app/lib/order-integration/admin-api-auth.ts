import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

type OrderIntegrationAuthSuccess = {
  userId: string;
  email: string;
};

type OrderIntegrationAuthFailure = {
  response: NextResponse;
};

/** 주문연동 API — 기존 엑클로드 관리자 기준을 통과한 사용자만 허용 */
export async function requireOrderIntegrationAdmin(): Promise<
  OrderIntegrationAuthSuccess | OrderIntegrationAuthFailure
> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim();

  if (!email) {
    return {
      response: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }),
    };
  }

  if (session.user.isAdmin !== true && !isAdminEmail(email)) {
    return {
      response: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return {
      response: NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 401 }),
    };
  }

  return { userId: user.id, email };
}

export function isAdminAuthFailure(
  result: OrderIntegrationAuthSuccess | OrderIntegrationAuthFailure,
): result is OrderIntegrationAuthFailure {
  return 'response' in result;
}
