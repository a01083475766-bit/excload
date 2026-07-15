import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';

export type OrderIntegrationUserAuthSuccess = {
  userId: string;
  email: string;
};

export type OrderIntegrationUserAuthFailure = {
  response: NextResponse;
};

/** 주문연동 사용자 API: 로그인한 사용자와 관리자 모두 본인 userId 범위로 접근합니다. */
export async function requireOrderIntegrationUser(): Promise<
  OrderIntegrationUserAuthSuccess | OrderIntegrationUserAuthFailure
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

export function isOrderIntegrationUserAuthFailure(
  result: OrderIntegrationUserAuthSuccess | OrderIntegrationUserAuthFailure,
): result is OrderIntegrationUserAuthFailure {
  return 'response' in result;
}
