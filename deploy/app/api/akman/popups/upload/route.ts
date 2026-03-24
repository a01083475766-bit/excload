import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'popups');
    await fs.mkdir(uploadsDir, { recursive: true });

    const originalName =
      (file as any).name && typeof (file as any).name === 'string'
        ? (file as any).name as string
        : 'popup.png';
    const ext = path.extname(originalName) || '.png';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const filePath = path.join(uploadsDir, safeName);
    await fs.writeFile(filePath, buffer);

    const imageUrl = `/uploads/popups/${safeName}`;

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    console.error('[AdminPopupUpload] 에러:', error);
    return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
  }
}

