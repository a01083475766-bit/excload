import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { isAdminEmail } from '@/app/lib/admin-auth'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.email) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    )
  }

  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 403 }
    )
  }

  const payments = await prisma.payment.findMany({
    select: {
      amount: true,
      createdAt: true
    }
  })

  const monthly = payments.reduce((acc: any, p) => {
    const month = new Date(p.createdAt).toISOString().slice(0,7)

    if (!acc[month]) acc[month] = 0

    acc[month] += p.amount

    return acc
  }, {})

  const result = Object.keys(monthly).map(m => ({
    month: m,
    revenue: monthly[m]
  }))

  return NextResponse.json(result)

}
