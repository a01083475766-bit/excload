/**
 * EXCLOAD 관리자 API - AI Header Mapping Log
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * GET /api/akman/ai-mapping
 * 
 * AI 헤더 매핑 로그를 조회합니다.
 * 관리자 권한 필요.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/lib/auth"
import { isAdminEmail } from "@/app/lib/admin-auth"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user || !session.user.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: "관리자 권한 필요" },
        { status: 403 }
      )
    }

    const logs = await prisma.aiHeaderMappingLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200
    })

    return NextResponse.json(logs)
  } catch (error) {
    console.error('[Akman AI Mapping API] 에러:', error)
    return NextResponse.json(
      { error: '시스템 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// DELETE: AI Header Mapping Log 삭제
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user || !session.user.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json(
        { error: "관리자 권한 필요" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: "로그 ID가 필요합니다." },
        { status: 400 }
      )
    }

    await prisma.aiHeaderMappingLog.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "로그가 삭제되었습니다.",
    })
  } catch (error: any) {
    console.error('[Akman AI Mapping API] 삭제 실패:', error)
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: "로그를 찾을 수 없습니다." },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: '로그 삭제 실패: ' + (error.message || '알 수 없는 오류') },
      { status: 500 }
    )
  }
}
