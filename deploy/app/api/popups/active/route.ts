import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET() {
  try {
    const now = new Date();

    const popups = await prisma.popupCampaign.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      popups,
    });
  } catch (error) {
    console.error('[ActivePopupsAPI] 에러:', error);
    return NextResponse.json(
      { success: false, error: '팝업 정보를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

