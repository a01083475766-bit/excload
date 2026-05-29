/**
 * 관리자 회원 삭제 API
 *
 * ⚠️ EXCLOAD CONSTITUTION v4.2 준수
 * 관리자 시스템은 파이프라인 구조와 독립적으로 동작합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import {
  DeleteUserAccountError,
  deleteUserAccountById,
} from '@/app/lib/delete-user-account';

interface DeleteUserRequest {
  userId: string;
}

/**
 * DELETE /api/akman/delete-user
 * 관리자가 사용자 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body: DeleteUserRequest = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
    }

    const deleted = await deleteUserAccountById(userId);

    return NextResponse.json({
      success: true,
      message: `사용자 ${deleted.email}가 삭제되었습니다.`,
    });
  } catch (error) {
    if (error instanceof DeleteUserAccountError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[Admin Delete User API] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '사용자 삭제 실패' },
      { status: 500 },
    );
  }
}
