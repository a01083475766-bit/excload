import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

export async function requireAkmanAdmin(): Promise<
  { ok: true; email: string; userId: string } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false, response: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  if (!isAdminEmail(session.user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }),
    };
  }
  let userId = session.user.id;
  if (!userId) {
    const u = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!u) {
      return {
        ok: false,
        response: NextResponse.json({ error: '관리자 계정을 찾을 수 없습니다.' }, { status: 403 }),
      };
    }
    userId = u.id;
  }
  return { ok: true, email: session.user.email, userId };
}
