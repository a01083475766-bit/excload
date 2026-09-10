import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import { downloadVoiceObject } from '@/app/lib/akman-voice/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const generation = await prisma.voiceGeneration.findUnique({
    where: { id },
    include: { voiceProfile: { select: { name: true } } },
  });
  if (!generation || generation.status !== 'COMPLETED' || !generation.outputStoragePath) {
    return NextResponse.json({ error: '다운로드할 음성이 없습니다.' }, { status: 404 });
  }

  let downloaded;
  try {
    downloaded = await downloadVoiceObject(generation.outputStoragePath);
  } catch (error) {
    console.error('[akman-voice] download failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '음성 파일을 불러오지 못했습니다.' }, { status: 500 });
  }
  if (!downloaded) {
    return NextResponse.json({ error: '음성 파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const safeName = (generation.voiceProfile?.name || 'voice')
    .replace(/[^\w가-힣\-]+/g, '_')
    .slice(0, 40);
  const filename = `${safeName}_${generation.id.slice(0, 8)}.wav`;
  const disposition = new URL(request.url).searchParams.get('inline') === '1' ? 'inline' : 'attachment';

  return new NextResponse(downloaded.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      ...(downloaded.contentLength ? { 'Content-Length': downloaded.contentLength } : {}),
    },
  });
}
