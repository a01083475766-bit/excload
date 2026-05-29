import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { calculateAbuseScore } from '@/app/lib/abuseScore';
import { addOneMonthKeepingDay } from '@/app/lib/add-one-month-keeping-day';
import {
  isSignupBonusBlocked,
  recordSignupBonusFingerprints,
} from '@/app/lib/free-benefit-fingerprint';

export interface UserAccessFields {
  isBlocked: boolean;
  abuseFlag: boolean;
  blockReason?: string | null;
}

export function getServiceBlockMessage(user: UserAccessFields): string | null {
  if (user.isBlocked) {
    return user.blockReason?.trim() || '이용이 제한된 계정입니다.';
  }
  if (user.abuseFlag) {
    return '비정상 이용 패턴이 감지되어 서비스 이용이 제한되었습니다. 문의가 필요하면 고객센터로 연락해 주세요.';
  }
  return null;
}

export function serviceBlockedResponse(user: UserAccessFields): NextResponse | null {
  const message = getServiceBlockMessage(user);
  if (!message) return null;
  return NextResponse.json({ error: message }, { status: 403 });
}

/** 로그인·가입·조회 시 IP 저장 후 어뷰즈 점수 재계산 */
export async function syncUserIpAndAbuseScore(userId: string, ip: string): Promise<void> {
  if (!ip || ip === 'unknown') {
    await calculateAbuseScore(userId);
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastIp: ip },
  });
  await calculateAbuseScore(userId);
}

/**
 * 소셜 최초 가입 등 아직 가입 보너스를 받지 않은 계정에 5000 지급 시도.
 * abuseFlag·fingerprint·이미 지급 여부를 확인합니다.
 */
export async function tryGrantInitialFreeBenefits(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      deviceId: true,
      points: true,
      abuseFlag: true,
      signupBonusClaimed: true,
    },
  });

  if (!user || user.signupBonusClaimed || user.points > 0) {
    return false;
  }

  const fingerprintBlocked = await isSignupBonusBlocked({
    email: user.email,
    phone: user.phone,
    deviceId: user.deviceId,
  });

  if (fingerprintBlocked || user.abuseFlag) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        signupBonusClaimed: true,
        nextPointDate: null,
      },
    });
    return false;
  }

  const signupNow = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      points: 5000,
      signupBonusClaimed: true,
      nextPointDate: addOneMonthKeepingDay(signupNow),
    },
  });

  await recordSignupBonusFingerprints({
    email: user.email,
    phone: user.phone,
    deviceId: user.deviceId,
  });

  return true;
}

export async function finalizeSignupFreeBenefits(params: {
  userId: string;
  email: string;
  phone: string | null;
  deviceId: string | null;
  clientIp: string;
  fingerprintBlocked: boolean;
}): Promise<{ granted: boolean; abuseFlag: boolean }> {
  await syncUserIpAndAbuseScore(params.userId, params.clientIp);

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { abuseFlag: true },
  });

  const abuseFlag = !!user?.abuseFlag;
  const canGrant = !params.fingerprintBlocked && !abuseFlag;

  if (canGrant) {
    const signupNow = new Date();
    await prisma.user.update({
      where: { id: params.userId },
      data: {
        points: 5000,
        signupBonusClaimed: true,
        nextPointDate: addOneMonthKeepingDay(signupNow),
      },
    });
    await recordSignupBonusFingerprints({
      email: params.email,
      phone: params.phone,
      deviceId: params.deviceId,
    });
    return { granted: true, abuseFlag: false };
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: {
      signupBonusClaimed: true,
      nextPointDate: null,
    },
  });

  return { granted: false, abuseFlag };
}
