import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import {
  buildVoiceReferenceObjectKey,
  createVoiceSignedUploadUrl,
  isVoiceStorageConfigured,
} from '@/app/lib/akman-voice/storage';
import {
  sanitizeVoiceOriginalName,
  validateReferenceUpload,
} from '@/app/lib/akman-voice/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Issues a short-lived signed upload URL so the browser uploads reference audio
 * directly to private Supabase Storage (avoids Vercel ~4.5MB body limit).
 */
export async function POST(request: Request) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  if (!isVoiceStorageConfigured()) {
    return NextResponse.json(
      { error: '음성 파일 저장소가 설정되지 않았습니다. VOICE_STORAGE_BUCKET을 확인해주세요.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const originalName = sanitizeVoiceOriginalName(
    typeof record.originalName === 'string' ? record.originalName : 'reference.wav',
  );
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null;
  const sizeBytes = typeof record.sizeBytes === 'number' ? record.sizeBytes : Number(record.sizeBytes);
  const durationSeconds =
    typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds)
      ? record.durationSeconds
      : null;

  const uploadCheck = validateReferenceUpload({
    originalName,
    mimeType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    durationSeconds,
  });
  if (!uploadCheck.ok) {
    return NextResponse.json({ error: uploadCheck.error }, { status: 400 });
  }

  const profileId = randomUUID();
  const objectKey = buildVoiceReferenceObjectKey(profileId, uploadCheck.ext);

  try {
    const signed = await createVoiceSignedUploadUrl(objectKey);
    return NextResponse.json({
      profileId,
      objectKey,
      mimeType: uploadCheck.mime,
      originalName,
      signedUploadUrl: signed.signedUploadUrl,
    });
  } catch (error) {
    console.error(
      '[akman-voice] signed upload url failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return NextResponse.json({ error: '참조 음성 업로드 URL 발급에 실패했습니다.' }, { status: 500 });
  }
}
