/**
 * FREE → BETA 마이그레이션
 * - plan: FREE → BETA
 * - points < 50,000 이면 50,000으로 맞춤 (+ PointHistory)
 * - nextPointDate 없으면 한 달 뒤로 설정
 *
 * 실행: npx tsx scripts/migrate-free-to-beta.mjs
 */
import { PrismaClient } from '@prisma/client';

const BETA_POINTS = 50_000;
const REASON = 'OPEN_BETA_MIGRATE_FREE_TO_BETA';

/** @param {Date} baseDate */
function addOneMonthKeepingDay(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();
  const hour = baseDate.getHours();
  const minute = baseDate.getMinutes();
  const second = baseDate.getSeconds();
  const millisecond = baseDate.getMilliseconds();
  const targetMonthStart = new Date(year, month + 1, 1, hour, minute, second, millisecond);
  const lastDayOfTargetMonth = new Date(year, month + 2, 0).getDate();
  targetMonthStart.setDate(Math.min(day, lastDayOfTargetMonth));
  return targetMonthStart;
}

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const freeUsers = await prisma.user.findMany({
    where: { plan: 'FREE' },
    select: {
      id: true,
      email: true,
      points: true,
      nextPointDate: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[migrate] FREE targets: ${freeUsers.length}`);

  let toppedUp = 0;
  let planOnly = 0;
  let nextDateSet = 0;

  for (const user of freeUsers) {
    const nextPoints = user.points < BETA_POINTS ? BETA_POINTS : user.points;
    const pointsChange = nextPoints - user.points;
    const needsNextDate = !user.nextPointDate;
    const nextPointDate = needsNextDate
      ? addOneMonthKeepingDay(now)
      : user.nextPointDate;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          plan: 'BETA',
          points: nextPoints,
          nextPointDate,
        },
      });

      if (pointsChange !== 0) {
        await tx.pointHistory.create({
          data: {
            userId: user.id,
            change: pointsChange,
            reason: REASON,
          },
        });
      }
    });

    if (pointsChange !== 0) toppedUp += 1;
    else planOnly += 1;
    if (needsNextDate) nextDateSet += 1;

    console.log(
      JSON.stringify({
        email: user.email,
        fromPoints: user.points,
        toPoints: nextPoints,
        pointsChange,
        nextPointDateSet: needsNextDate,
      }),
    );
  }

  const byPlan = await prisma.user.groupBy({
    by: ['plan'],
    _count: { _all: true },
  });

  console.log(
    JSON.stringify(
      {
        done: true,
        migrated: freeUsers.length,
        toppedUp,
        planOnly,
        nextDateSet,
        byPlan,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
