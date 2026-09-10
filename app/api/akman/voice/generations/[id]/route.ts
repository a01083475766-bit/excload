import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import { deleteVoiceObject } from '@/app/lib/akman-voice/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const generation = await prisma.voiceGeneration.findUnique({
    where: { id },
    include: { voiceProfile: { select: { name: true } } },
  });
  if (!generation) {
    return NextResponse.json({ error: '생성 결과를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ generation: serializeGeneration(generation) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const generation = await prisma.voiceGeneration.findUnique({ where: { id } });
  if (!generation) {
    return NextResponse.json({ error: '생성 결과를 찾을 수 없습니다.' }, { status: 404 });
  }

  await prisma.voiceGeneration.delete({ where: { id } });
  if (generation.outputStoragePath) {
    try {
      await deleteVoiceObject(generation.outputStoragePath);
    } catch (error) {
      console.error(
        '[akman-voice] generation cleanup failed',
        error instanceof Error ? error.message : 'unknown',
      );
    }
  }

  return NextResponse.json({ success: true });
}
