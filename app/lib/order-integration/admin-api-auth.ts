import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

type OrderIntegrationAuthSuccess = {
  userId: string;
  email: string;
};

type OrderIntegrationAuthFailure = {
  response: NextResponse;
};

/** 주문연동 API — 로그인 사용자(본인 계정 스코프)면 허용 */
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
