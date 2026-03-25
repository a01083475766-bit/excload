import { prisma } from '@/app/lib/prisma';

export async function calculateAbuseScore(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) return;

  let score = 0;
  const reasons: string[] = [];

  // 1️⃣ 같은 deviceId 사용자 수
  if (user.deviceId) {
    const sameDeviceUsers = await prisma.user.count({
      where: {
        deviceId: user.deviceId,
      },
    });

    if (sameDeviceUsers >= 2) {
      score += 3;
      reasons.push('같은 deviceId 다중 계정');
    }
  }

  // 2️⃣ 같은 IP 사용자 수
  if (user.lastIp) {
    const sameIpUsers = await prisma.user.count({
      where: {
        lastIp: user.lastIp,
      },
    });

    if (sameIpUsers >= 3) {
      score += 2;
      reasons.push('같은 IP 다중 계정');
    }
  }

  const isAbuser = score >= 5;

  await prisma.user.update({
    where: { id: userId },
    data: {
      abuseScore: score,
      abuseFlag: isAbuser,
      abuseReason: reasons.join(', '),
    },
  });
}

