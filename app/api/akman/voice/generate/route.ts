import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import {
  buildVoiceOutputObjectKey,
  createVoiceSignedDownloadUrl,
  createVoiceSignedUploadUrl,
  isVoiceStorageConfigured,
  voiceObjectExists,
} from '@/app/lib/akman-voice/storage';
import { callVoiceWorkerGenerate, getVoiceServiceStatus } from '@/app/lib/akman-voice/voice-service';
import { validateGenerateFields } from '@/app/lib/akman-voice/validation';
import { VOICE_WORKER_URL_EXPIRES_SEC } from '@/app/lib/akman-voice/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Vercel Pro 상한. Worker 클라이언트 timeout(240s)보다 길게 두어 Abort 후 FAILED 정리를 끝낼 여유를 둠. */
export const maxDuration = 300;

function serializeGeneration(generation: {
  id: string;
  voiceProfileId: string;
  text: string;
  instruction: string | null;
  speed: number;
  status: string;
  errorMessage: string | null;
  outputStoragePath: string | null;
  createdAt: Date;
  updatedAt: Date;
  voiceProfile?: { name: string } | null;
}) {
  return {
    id: generation.id,
    voiceProfileId: generation.voiceProfileId,
    voiceProfileName: generation.voiceProfile?.name ?? null,
    text: generation.text,
    instruction: generation.instruction,
    speed: generation.speed,
    status: generation.status,
    errorMessage: generation.errorMessage,
    hasAudio: Boolean(generation.outputStoragePath) && generation.status === 'COMPLETED',
    createdAt: generation.createdAt.toISOString(),
    updatedAt: generation.updatedAt.toISOString(),
  };
}

async function markGenerationFailed(generationId: string, errorMessage: string) {
  try {
    await prisma.voiceGeneration.update({
      where: { id: generationId },
      data: { status: 'FAILED', errorMessage },
    });
  } catch (error) {
    console.error(
      '[akman-voice] failed to mark generation FAILED',
      error instanceof Error ? error.message : 'unknown',
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const voiceService = getVoiceServiceStatus();
  if (!voiceService.configured) {
    return NextResponse.json(
      { error: 'GPU 음성 엔진이 아직 설정되지 않았습니다.' },
      { status: 503 },
    );
  }
  if (!isVoiceStorageConfigured()) {
    return NextResponse.json(
      { error: '음성 파일 저장소가 설정되지 않았습니다.' },
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
  const voiceProfileId = typeof record.voiceProfileId === 'string' ? record.voiceProfileId : '';
  if (!voiceProfileId) {
    return NextResponse.json({ error: '캐릭터를 선택해주세요.' }, { status: 400 });
  }

  const fields = validateGenerateFields({
    text: typeof record.text === 'string' ? record.text : '',
    instruction: typeof record.instruction === 'string' ? record.instruction : null,
    speed: typeof record.speed === 'number' ? record.speed : null,
  });
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const profile = await prisma.voiceProfile.findUnique({ where: { id: voiceProfileId } });
  if (!profile) {
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }

  const generation = await prisma.voiceGeneration.create({
    data: {
      voiceProfileId: profile.id,
      text: fields.text,
      instruction: fields.instruction,
      speed: fields.speed,
      status: 'PROCESSING',
    },
    include: { voiceProfile: { select: { name: true } } },
  });

  try {
    const outputKey = buildVoiceOutputObjectKey(profile.id, generation.id);

    let referenceSigned;
    let outputSigned;
    try {
      referenceSigned = await createVoiceSignedDownloadUrl(
        profile.referenceStoragePath,
        VOICE_WORKER_URL_EXPIRES_SEC,
      );
      outputSigned = await createVoiceSignedUploadUrl(outputKey);
    } catch (error) {
      console.error(
        '[akman-voice] signed url prep failed',
        error instanceof Error ? error.message : 'unknown',
      );
      await markGenerationFailed(generation.id, '음성 저장소 URL 발급에 실패했습니다.');
      return NextResponse.json({ error: '음성 저장소 URL 발급에 실패했습니다.' }, { status: 500 });
    }

    const workerResult = await callVoiceWorkerGenerate({
      referenceDownloadUrl: referenceSigned.signedDownloadUrl,
      referenceFilename: profile.referenceOriginalName,
      outputUploadUrl: outputSigned.signedUploadUrl,
      outputObjectKey: outputKey,
      promptText: profile.promptText,
      text: fields.text,
      instruction: fields.instruction,
      speed: fields.speed,
    });

    if (!workerResult.ok) {
      await markGenerationFailed(generation.id, workerResult.error);
      return NextResponse.json({ error: workerResult.error }, { status: workerResult.status });
    }

    let exists = false;
    try {
      exists = await voiceObjectExists(workerResult.outputStoragePath);
    } catch (error) {
      console.error(
        '[akman-voice] output existence check failed',
        error instanceof Error ? error.message : 'unknown',
      );
      await markGenerationFailed(generation.id, '생성 음성 확인에 실패했습니다.');
      return NextResponse.json({ error: '생성 음성 확인에 실패했습니다.' }, { status: 500 });
    }
    if (!exists) {
      await markGenerationFailed(generation.id, '생성 음성이 저장소에 없습니다.');
      return NextResponse.json({ error: '생성 음성이 저장소에 없습니다.' }, { status: 502 });
    }

    const completed = await prisma.voiceGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'COMPLETED',
        outputStoragePath: workerResult.outputStoragePath,
        errorMessage: null,
      },
      include: { voiceProfile: { select: { name: true } } },
    });

    return NextResponse.json({ generation: serializeGeneration(completed) });
  } catch (error) {
    console.error(
      '[akman-voice] generate unexpected failure',
      error instanceof Error ? error.message : 'unknown',
    );
    await markGenerationFailed(generation.id, '음성 생성 중 오류가 발생했습니다.');
    return NextResponse.json({ error: '음성 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
