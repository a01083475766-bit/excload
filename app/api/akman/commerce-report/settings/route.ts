/**
 * GET/PATCH /api/akman/commerce-report/settings — 커머스 리포트 설정 (관리자 전용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import { prisma } from '@/app/lib/prisma';
import {
  getCommerceReportSettings,
  invalidateCommerceReportSettingsCache,
} from '@/app/lib/commerce-report/settings';
import { isCommerceReportTone } from '@/app/lib/commerce-report/types';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const settings = await getCommerceReportSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('[CommerceReportSettingsGET]', error);
    return NextResponse.json({ error: '설정을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const data: { bannedWords?: string[]; adPhrase?: string; toneStyle?: string } = {};

    if (Array.isArray(body.bannedWords)) {
      data.bannedWords = body.bannedWords.filter((v: unknown): v is string => typeof v === 'string');
    }
    if (typeof body.adPhrase === 'string') {
      data.adPhrase = body.adPhrase;
    }
    if (typeof body.toneStyle === 'string' && isCommerceReportTone(body.toneStyle)) {
      data.toneStyle = body.toneStyle;
    }

    const current = await getCommerceReportSettings();
    await prisma.commerceReportSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        bannedWords: data.bannedWords ?? current.bannedWords,
        adPhrase: data.adPhrase ?? current.adPhrase,
        toneStyle: data.toneStyle ?? current.toneStyle,
      },
      update: data,
    });

    invalidateCommerceReportSettingsCache();
    const settings = await getCommerceReportSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('[CommerceReportSettingsPATCH]', error);
    return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 });
  }
}
