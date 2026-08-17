import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { OEG_RECORDER_DOWNLOAD_STAT_KEY } from '@/app/free-tools/oeg-recorder-release';

/**
 * POST /api/free-tools/oeg-recorder/download-click
 * 다운로드 버튼 클릭 1회 기록 (로그인 불필요).
 */
export async function POST() {
  try {
    const row = await prisma.freeToolDownloadStat.upsert({
      where: { toolKey: OEG_RECORDER_DOWNLOAD_STAT_KEY },
      create: { toolKey: OEG_RECORDER_DOWNLOAD_STAT_KEY, count: 1 },
      update: { count: { increment: 1 } },
    });

    return NextResponse.json({ ok: true, count: row.count });
  } catch (error) {
    console.error('[oeg-recorder/download-click]', error);
    // 기록 실패해도 다운로드 자체는 막지 않음
    return NextResponse.json({ ok: true, degraded: true });
  }
}
