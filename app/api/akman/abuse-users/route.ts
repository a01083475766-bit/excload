import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      abuseFlag: true,
    },
    orderBy: {
      abuseScore: 'desc',
    },
    select: {
      id: true,
      email: true,
      deviceId: true,
      lastIp: true,
      abuseScore: true,
      abuseReason: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

