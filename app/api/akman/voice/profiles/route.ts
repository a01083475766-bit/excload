import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import {
  deleteVoiceObject,
  isVoiceStorageConfigured,
  voiceObjectExists,
} from '@/app/lib/akman-voice/storage';
import { getVoiceServiceStatus } from '@/app/lib/akman-voice/voice-service';
import {
  sanitizeVoiceOriginalName,
  validateProfileFields,
  validateReferenceUpload,
} from '@/app/lib/akman-voice/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function serializeProfile(profile: {
  id: string;
  name: string;
  referenceOriginalName: string;
  referenceMimeType: string;
  referenceDurationSeconds: number | null;
  promptText: string;
  defaultInstruction: string | null;
  defaultSpeed: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    name: profile.name,
    referenceOriginalName: profile.referenceOriginalName,
    referenceMimeType: profile.referenceMimeType,
    referenceDurationSeconds: profile.referenceDurationSeconds,
    promptText: profile.promptText,
    defaultInstruction: profile.defaultInstruction,
    defaultSpeed: profile.defaultSpeed,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function GET() {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const profiles = await prisma.voiceProfile.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    profiles: profiles.map(serializeProfile),
    voiceService: getVoiceServiceStatus(),
    storageConfigured: isVoiceStorageConfigured(),
  });
}

/**
 * Completes profile creation after the browser uploaded reference audio
 * via a signed URL (no audio binary through Vercel).
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
  const profileId = typeof record.profileId === 'string' ? record.profileId.trim() : '';
  const objectKey = typeof record.objectKey === 'string' ? record.objectKey.trim() : '';
  const originalName = sanitizeVoiceOriginalName(
    typeof record.originalName === 'string' ? record.originalName : 'reference.wav',
  );
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : '';
  const sizeBytes = typeof record.sizeBytes === 'number' ? record.sizeBytes : Number(record.sizeBytes);
  const durationSeconds =
    typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds)
      ? record.durationSeconds
      : null;

  if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    return NextResponse.json({ error: '잘못된 프로필 ID입니다.' }, { status: 400 });
  }
  if (!objectKey.startsWith(`voice/refs/${profileId}/`) || objectKey.includes('..')) {
    return NextResponse.json({ error: '잘못된 저장 경로입니다.' }, { status: 400 });
  }

  const fields = validateProfileFields({
    name: typeof record.name === 'string' ? record.name : '',
    promptText: typeof record.promptText === 'string' ? record.promptText : '',
    defaultInstruction:
      typeof record.defaultInstruction === 'string' ? record.defaultInstruction : null,
    defaultSpeed: typeof record.defaultSpeed === 'number' ? record.defaultSpeed : null,
  });
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const uploadCheck = validateReferenceUpload({
    originalName,
    mimeType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    durationSeconds,
  });
  if (!uploadCheck.ok) {
    return NextResponse.json({ error: uploadCheck.error }, { status: 400 });
  }

  const expectedKeySuffix = objectKey.slice(objectKey.lastIndexOf('.'));
  if (expectedKeySuffix !== uploadCheck.ext) {
    return NextResponse.json({ error: '파일 확장자와 저장 경로가 일치하지 않습니다.' }, { status: 400 });
  }

  let exists = false;
  try {
    exists = await voiceObjectExists(objectKey);
  } catch (error) {
    console.error(
      '[akman-voice] reference existence check failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return NextResponse.json({ error: '참조 음성 확인에 실패했습니다.' }, { status: 500 });
  }
  if (!exists) {
    return NextResponse.json(
      { error: '참조 음성이 아직 업로드되지 않았습니다. 다시 시도해주세요.' },
      { status: 400 },
    );
  }

  try {
    const profile = await prisma.voiceProfile.create({
      data: {
        id: profileId,
        name: fields.name,
        referenceStoragePath: objectKey,
        referenceOriginalName: originalName,
        referenceMimeType: uploadCheck.mime,
        referenceDurationSeconds: durationSeconds,
        referenceSizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        promptText: fields.promptText,
        defaultInstruction: fields.defaultInstruction,
        defaultSpeed: fields.defaultSpeed,
      },
    });
    return NextResponse.json({ profile: serializeProfile(profile) }, { status: 201 });
  } catch (error) {
    console.error('[akman-voice] profile create failed', error instanceof Error ? error.message : 'unknown');
    try {
      await deleteVoiceObject(objectKey);
    } catch {
      // ignore cleanup failure
    }
    return NextResponse.json({ error: '캐릭터 저장에 실패했습니다.' }, { status: 500 });
  }
}
