import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { title, imageUrl, linkUrl, startAt, endAt, isActive, priority, target, showEveryVisit } = body;

    // 안전하게 id 추출 (params가 비어있는 경우 대비)
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const fallbackId = segments[segments.length - 1];
    const id = params?.id || fallbackId;

    const popup = await prisma.popupCampaign.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(linkUrl !== undefined && { linkUrl }),
        ...(startAt && { startAt: new Date(startAt) }),
        ...(endAt && { endAt: new Date(endAt) }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority }),
        ...(target !== undefined && { target }),
        ...(showEveryVisit !== undefined && { showEveryVisit }),
      },
    });

    return NextResponse.json({ success: true, popup });
  } catch (error) {
    console.error('[AdminPopupsPATCH] 에러:', error);
    return NextResponse.json({ error: '팝업 수정에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const fallbackId = segments[segments.length - 1];
    const id = params?.id || fallbackId;

    await prisma.popupCampaign.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminPopupsDELETE] 에러:', error);
    return NextResponse.json({ error: '팝업 삭제에 실패했습니다.' }, { status: 500 });
  }
}

