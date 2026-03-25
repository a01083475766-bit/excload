import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const items = await prisma.popupCampaign.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('[AdminPopupsGET] 에러:', error);
    return NextResponse.json({ error: '팝업 목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    const {
      title,
      imageUrl,
      linkUrl,
      startAt,
      endAt,
      isActive = true,
      priority = 0,
      target = 'ALL',
      showEveryVisit = true,
    } = body;

    if (!title || !imageUrl || !startAt || !endAt) {
      return NextResponse.json({ error: '제목, 이미지, 기간은 필수입니다.' }, { status: 400 });
    }

    const popup = await prisma.popupCampaign.create({
      data: {
        title,
        imageUrl,
        linkUrl: linkUrl || null,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        isActive,
        priority,
        target,
        showEveryVisit,
      },
    });

    return NextResponse.json({ success: true, popup });
  } catch (error) {
    console.error('[AdminPopupsPOST] 에러:', error);
    return NextResponse.json({ error: '팝업 생성에 실패했습니다.' }, { status: 500 });
  }
}

