import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';

export type FeedbackViewer = {
  userId: string | null;
  email: string | null;
  isAdmin: boolean;
};

const EMPTY_VIEWER: FeedbackViewer = {
  userId: null,
  email: null,
  isAdmin: false,
};

export function viewerFromToken(token: Awaited<ReturnType<typeof getToken>>): FeedbackViewer {
  if (!token || typeof token === 'string') return EMPTY_VIEWER;
  const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : null;
  const userId =
    typeof token.id === 'string'
      ? token.id
      : typeof token.sub === 'string'
        ? token.sub
        : null;
  if (!email && !userId) return EMPTY_VIEWER;
  return {
    userId,
    email,
    isAdmin: Boolean(token.isAdmin) || isAdminEmail(email),
  };
}

/** API Route: getServerSession 대신 JWT만 읽어 세션 오버헤드를 줄입니다. */
export async function getFeedbackViewerFromRequest(req: {
  headers: Headers | Record<string, string | string[] | undefined>;
}): Promise<FeedbackViewer> {
  const token = await getToken({
    req: req as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });
  return viewerFromToken(token);
}

/** RSC: 요청 Cookie에서 JWT만 읽습니다. */
export async function getFeedbackViewerFromCookies(): Promise<FeedbackViewer> {
  const headerList = await headers();
  const cookieHeader = headerList.get('cookie') ?? '';
  if (!cookieHeader) return EMPTY_VIEWER;

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } } as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
  });
  return viewerFromToken(token);
}

export async function resolveFeedbackViewerUserId(
  viewer: FeedbackViewer,
): Promise<string | null> {
  if (viewer.userId) return viewer.userId;
  if (!viewer.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: viewer.email },
    select: { id: true },
  });
  return user?.id ?? null;
}
