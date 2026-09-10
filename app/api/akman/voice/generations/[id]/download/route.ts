import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import { createVoiceSignedDownloadUrl } from '@/app/lib/akman-voice/storage';
import { VOICE_BROWSER_DOWNLOAD_EXPIRES_SEC } from '@/app/lib/akman-voice/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Redirects to a short-lived private Storage signed URL.
 * WAV bytes do not pass through the Vercel function response body.
 */
export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const generation = await prisma.voiceGeneration.findUnique({
    where: { id },
  });
  if (!generation || generation.status !== 'COMPLETED' || !generation.outputStoragePath) {
    return NextResponse.json({ error: '다운로드할 음성이 없습니다.' }, { status: 404 });
  }

  try {
    const signed = await createVoiceSignedDownloadUrl(
      generation.outputStoragePath,
      VOICE_BROWSER_DOWNLOAD_EXPIRES_SEC,
    );
    return NextResponse.redirect(signed.signedDownloadUrl, 302);
  } catch (error) {
    console.error('[akman-voice] signed download failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '음성 파일을 불러오지 못했습니다.' }, { status: 500 });
  }
}
