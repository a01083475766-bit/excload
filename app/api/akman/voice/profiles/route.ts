import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import {
  buildVoiceReferenceObjectKey,
  deleteVoiceObject,
  isVoiceStorageConfigured,
  uploadVoiceObject,
} from '@/app/lib/akman-voice/storage';
import { getVoiceServiceStatus } from '@/app/lib/akman-voice/voice-service';
import {
  sanitizeVoiceOriginalName,
  tryReadWavDurationSeconds,
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

export async function POST(request: Request) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  if (!isVoiceStorageConfigured()) {
    return NextResponse.json(
      { error: '음성 파일 저장소가 설정되지 않았습니다. VOICE_STORAGE_BUCKET을 확인해주세요.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const name = String(form.get('name') ?? '');
  const promptText = String(form.get('promptText') ?? '');
  const defaultInstruction = String(form.get('defaultInstruction') ?? '');
  const defaultSpeedRaw = form.get('defaultSpeed');
  const defaultSpeed =
    defaultSpeedRaw === null || defaultSpeedRaw === ''
      ? null
      : Number(defaultSpeedRaw);
  const durationRaw = form.get('durationSeconds');
  const clientDuration =
    durationRaw === null || durationRaw === '' ? null : Number(durationRaw);

  const fields = validateProfileFields({
    name,
    promptText,
    defaultInstruction,
    defaultSpeed,
  });
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const file = form.get('referenceAudio');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: '참조 음성 파일이 필요합니다.' }, { status: 400 });
  }

  const originalName = sanitizeVoiceOriginalName(file.name || 'reference.wav');
  const bytes = Buffer.from(await file.arrayBuffer());
  const wavDuration = tryReadWavDurationSeconds(bytes);
  const durationSeconds =
    wavDuration ??
    (typeof clientDuration === 'number' && Number.isFinite(clientDuration) ? clientDuration : null);

  const uploadCheck = validateReferenceUpload({
    originalName,
    mimeType: file.type,
    sizeBytes: bytes.length,
    durationSeconds,
  });
  if (!uploadCheck.ok) {
    return NextResponse.json({ error: uploadCheck.error }, { status: 400 });
  }

  const profileId = randomUUID();
  const objectKey = buildVoiceReferenceObjectKey(profileId, uploadCheck.ext);

  try {
    await uploadVoiceObject({
      objectKey,
      bytes,
      contentType: uploadCheck.mime,
    });
  } catch (error) {
    console.error('[akman-voice] reference upload failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '참조 음성 저장에 실패했습니다.' }, { status: 500 });
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
        referenceSizeBytes: bytes.length,
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
