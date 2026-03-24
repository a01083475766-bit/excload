import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
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

