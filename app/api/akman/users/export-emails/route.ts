/**
 * 관리자 — 회원 이메일 목록 엑셀 다운로드 (외부 메일 발송용 정리)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import * as XLSX from 'xlsx';

function formatDateTimeKst(d: Date): string {
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        email: true,
        name: true,
        plan: true,
        emailVerified: true,
        createdAt: true,
        isBlocked: true,
      },
    });

    if (users.length === 0) {
      const emptyWs = XLSX.utils.json_to_sheet([
        { 안내: '등록된 회원이 없습니다.' },
      ]);
      const wb0 = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb0, emptyWs, '이메일목록');
      const buffer0 = XLSX.write(wb0, { type: 'buffer', bookType: 'xlsx' });
      const fileName0 = `excload-member-emails-${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buffer0, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName0}"`,
        },
      });
    }

    const rows = users.map((u, index) => ({
      No: index + 1,
      이메일: u.email,
      이름: u.name ?? '',
      플랜: u.plan,
      이메일인증: u.emailVerified ? '완료' : '미완료',
      가입일시: formatDateTimeKst(u.createdAt),
      계정상태: u.isBlocked ? '차단' : '정상',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '이메일목록');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `excload-member-emails-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('[Admin Member Emails Export API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '엑셀 다운로드 실패' },
      { status: 500 },
    );
  }
}
