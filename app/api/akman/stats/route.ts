import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { isAdminEmail } from '@/app/lib/admin-auth'
import { OEG_RECORDER_DOWNLOAD_STAT_KEY } from '@/app/free-tools/oeg-recorder-release'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: '관리자 권한 필요' }, { status: 403 })
  }

  const totalUsers = await prisma.user.count()

  const freeUsers = await prisma.user.count({
    where: { plan: 'FREE' }
  })

  const betaUsers = await prisma.user.count({
    where: { plan: 'BETA' }
  })

  const proUsers = await prisma.user.count({
    where: { plan: 'PRO' }
  })

  const yearlyUsers = await prisma.user.count({
    where: { plan: 'YEARLY' }
  })

  const today = new Date()
  today.setHours(0,0,0,0)

  const todayUsers = await prisma.user.count({
    where: {
      createdAt: {
        gte: today
      }
    }
  })

  let newUsersSince: number | null = null
  const sinceRaw = new URL(request.url).searchParams.get('since')
  if (sinceRaw) {
    const sinceDate = new Date(sinceRaw)
    if (!Number.isNaN(sinceDate.getTime())) {
      newUsersSince = await prisma.user.count({
        where: { createdAt: { gt: sinceDate } },
      })
    }
  }

  // 이번달 시작
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0,0,0,0)

  // 이번달 가입
  const monthlyUsers = await prisma.user.count({
    where: {
      createdAt: {
        gte: startOfMonth
      }
    }
  })

  // 총 매출
  const revenue = await prisma.payment.aggregate({
    _sum: { amount: true }
  })

  // 이번달 매출
  const monthlyRevenue = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: {
      createdAt: {
        gte: startOfMonth
      }
    }
  })

  const oegRecorderDownload = await prisma.freeToolDownloadStat.findUnique({
    where: { toolKey: OEG_RECORDER_DOWNLOAD_STAT_KEY },
    select: { count: true },
  })

  return Response.json({
    totalUsers,
    betaUsers,
    freeUsers,
    proUsers,
    yearlyUsers,
    todayUsers,
    newUsersSince,
    monthlyUsers,
    revenue: revenue._sum.amount || 0,
    monthlyRevenue: monthlyRevenue._sum.amount || 0,
    oegRecorderDownloads: oegRecorderDownload?.count ?? 0,
  })
}
