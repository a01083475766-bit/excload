import { NextResponse } from 'next/server';
import { requireAkmanAdmin } from '@/app/lib/voucher/require-akman-admin';
import { prisma } from '@/app/lib/prisma';
import { deleteVoiceObject } from '@/app/lib/akman-voice/storage';
import { validateProfileFields } from '@/app/lib/akman-voice/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: '캐릭터 ID가 필요합니다.' }, { status: 400 });
  }

  const existing = await prisma.voiceProfile.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const fields = validateProfileFields({
    name: typeof record.name === 'string' ? record.name : existing.name,
    promptText: typeof record.promptText === 'string' ? record.promptText : existing.promptText,
    defaultInstruction:
      typeof record.defaultInstruction === 'string'
        ? record.defaultInstruction
        : existing.defaultInstruction,
    defaultSpeed:
      typeof record.defaultSpeed === 'number' ? record.defaultSpeed : existing.defaultSpeed,
  });
  if (!fields.ok) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const profile = await prisma.voiceProfile.update({
    where: { id },
    data: {
      name: fields.name,
      promptText: fields.promptText,
      defaultInstruction: fields.defaultInstruction,
      defaultSpeed: fields.defaultSpeed,
    },
  });

  return NextResponse.json({
    profile: {
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
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await requireAkmanAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: '캐릭터 ID가 필요합니다.' }, { status: 400 });
  }

  const existing = await prisma.voiceProfile.findUnique({
    where: { id },
    include: { generations: { select: { outputStoragePath: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }

  const objectKeys = [
    existing.referenceStoragePath,
    ...existing.generations
      .map((g) => g.outputStoragePath)
      .filter((path): path is string => Boolean(path)),
  ];

  await prisma.voiceProfile.delete({ where: { id } });

  for (const objectKey of objectKeys) {
    try {
      await deleteVoiceObject(objectKey);
    } catch (error) {
      console.error(
        '[akman-voice] storage cleanup failed',
        error instanceof Error ? error.message : 'unknown',
      );
    }
  }

  return NextResponse.json({ success: true });
}
