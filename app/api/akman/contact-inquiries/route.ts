import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/prisma';
import { isAdminEmail } from '@/app/lib/admin-auth';
import {
  type ContactInquiryStatus,
  isContactInquiryStatus,
} from '@/app/lib/contact-inquiry';

function requireAdmin(session: { user?: { email?: string | null } } | null) {
  if (!session?.user?.email) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdmin(session);
    if (denied) return denied;

    const statusFilter = request.nextUrl.searchParams.get('status')?.trim();
    const where =
      statusFilter && isContactInquiryStatus(statusFilter) ? { status: statusFilter } : {};

    const inquiries = await prisma.contactInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        typeLabel: true,
        name: true,
        email: true,
        subject: true,
        message: true,
        company: true,
        phone: true,
        attachmentName: true,
        status: true,
        mailSent: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
        processedAt: true,
      },
    });

    const newCount = await prisma.contactInquiry.count({ where: { status: 'NEW' } });

    return NextResponse.json({
      success: true,
      newCount,
      inquiries: inquiries.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        processedAt: row.processedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[Akman Contact Inquiries API][GET] error:', error);
    return NextResponse.json({ error: '고객문의 목록 조회 실패' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdmin(session);
    if (denied) return denied;

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      status?: ContactInquiryStatus;
      adminNote?: string;
    };

    const id = (body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const data: {
      status?: ContactInquiryStatus;
      adminNote?: string | null;
      processedAt?: Date | null;
    } = {};

    if (body.status !== undefined) {
      if (!isContactInquiryStatus(body.status)) {
        return NextResponse.json({ error: '유효하지 않은 status입니다.' }, { status: 400 });
      }
      data.status = body.status;
      data.processedAt = body.status === 'NEW' ? null : new Date();
    }

    if (body.adminNote !== undefined) {
      const note = body.adminNote.trim();
      data.adminNote = note.length > 0 ? note.slice(0, 2000) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const updated = await prisma.contactInquiry.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      inquiry: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        processedAt: updated.processedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    console.error('[Akman Contact Inquiries API][PATCH] error:', error);
    return NextResponse.json({ error: '고객문의 수정 실패' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdmin(session);
    if (denied) return denied;

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      ids?: unknown[];
    };
    const ids = Array.isArray(body.ids)
      ? [
          ...new Set(
            body.ids
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ]
      : typeof body.id === 'string' && body.id.trim()
        ? [body.id.trim()]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: '삭제할 고객문의 ID가 필요합니다.' }, { status: 400 });
    }

    const result = await prisma.contactInquiry.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('[Akman Contact Inquiries API][DELETE] error:', error);
    return NextResponse.json({ error: '고객문의 삭제 실패' }, { status: 500 });
  }
}
