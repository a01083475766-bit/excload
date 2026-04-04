import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  TRIAL_ACCESS_LIMITS_ENABLED,
  TRIAL_ACCESS_MAX_PER_IP,
} from '@/app/lib/trial-access';

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return request.headers.get('cf-connecting-ip')?.trim() ?? 'unknown';
}

function hashIp(ip: string): string {
  const salt = process.env.TRIAL_IP_SALT ?? 'excload-trial-ip-v1';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

/** TRIAL_BYPASS_IPS=공인IP1,공인IP2 — 카운트·차단 없음. 로컬 루프백은 항상 제외 */
function isTrialIpBypassed(ip: string): boolean {
  const trimmed = ip.trim();
  if (
    trimmed === '127.0.0.1' ||
    trimmed === '::1' ||
    trimmed.startsWith('::ffff:127.0.0.1')
  ) {
    return true;
  }
  const list =
    process.env.TRIAL_BYPASS_IPS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return list.length > 0 && list.includes(trimmed);
}

/**
 * POST /api/trial/allow
 * 체험 페이지 진입 1회당 IP 카운트 1 증가. 상한 초과 시 403.
 */
export async function POST(request: NextRequest) {
  try {
    if (!TRIAL_ACCESS_LIMITS_ENABLED) {
      return NextResponse.json({ ok: true, limitsDisabled: true });
    }

    const ip = getClientIp(request);

    if (isTrialIpBypassed(ip)) {
      return NextResponse.json({
        ok: true,
        remaining: null,
        bypassed: true,
      });
    }

    const ipHash = hashIp(ip);

    const { prisma } = await import('@/app/lib/prisma');

    const row = await prisma.trialIpAccess.findUnique({
      where: { ipHash },
    });
    const current = row?.count ?? 0;

    if (current >= TRIAL_ACCESS_MAX_PER_IP) {
      return NextResponse.json(
        { ok: false, reason: 'ip_limit', limit: TRIAL_ACCESS_MAX_PER_IP },
        { status: 403 },
      );
    }

    const updated = await prisma.trialIpAccess.upsert({
      where: { ipHash },
      create: { ipHash, count: 1 },
      update: { count: { increment: 1 } },
    });

    return NextResponse.json({
      ok: true,
      remaining: Math.max(0, TRIAL_ACCESS_MAX_PER_IP - updated.count),
    });
  } catch (e) {
    console.error('[trial/allow]', e);
    // DB 오류 시 체험 이용 자체를 막지 않음 (운영 이슈 대비)
    return NextResponse.json({ ok: true, remaining: null, degraded: true });
  }
}
