/**
 * 엑셀 다운로드 API
 * 
 * ⚠️ EXCLOAD CONSTITUTION v4.3 준수
 * 사용량 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 * 
 * POST /api/download
 * body: { excelData: any[][], fileName: string }
 * 
 * 엑셀 다운로드 실행 시 사용량 차감 기능 포함
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import * as XLSX from 'xlsx';

interface DownloadRequest {
  excelData: any[][];
  fileName: string;
}

/**
 * POST /api/download
 * 엑셀 다운로드 (사용량 차감 포함)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 세션 확인
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 2. 요청 본문 파싱
    const body: DownloadRequest = await request.json();
    const { excelData, fileName } = body;

    if (!excelData || !Array.isArray(excelData) || excelData.length === 0) {
      return NextResponse.json(
        { error: '다운로드할 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json(
        { error: '파일명이 필요합니다.' },
        { status: 400 }
      );
    }

    // 3. 현재 로그인 사용자 조회
    const userEmail = session.user.email;
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        plan: true,
        points: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 4. FREE 플랜일 경우만 사용량 검사
    let usedPoints = 0;
    if (user.plan === 'FREE') {
      if (user.points < 1000) {
        return NextResponse.json(
          { error: '사용량이 부족합니다.' },
          { status: 400 }
        );
      }
    }

    // 5. 기존 엑셀 생성 / 다운로드 로직 실행
    // ⚠️ 기존 다운로드 로직 절대 수정하지 말 것
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // 엑셀 파일을 Buffer로 변환
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 6. 다운로드 성공 후 사용량 차감 (FREE 플랜만)
    if (user.plan === 'FREE') {
      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data: {
          points: {
            decrement: 1000,
          },
        },
        select: {
          id: true,
          email: true,
          plan: true,
          points: true,
        },
      });

      // 사용량 차감 로그 기록
      await prisma.pointHistory.create({
        data: {
          userId: updatedUser.id,
          change: -1000,
          reason: 'DOWNLOAD_FILE',
        },
      });

      usedPoints = 1000;
    }

    // 7. 성공 응답 반환 (엑셀 파일 + 사용량 정보)
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'X-Used-Points': usedPoints.toString(),
      },
    });
  } catch (error) {
    console.error('[Download API] 에러:', error);
    return NextResponse.json(
      { error: '시스템 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
