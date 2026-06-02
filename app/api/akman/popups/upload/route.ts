import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { isAdminEmail } from '@/app/lib/admin-auth';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME_TO_EXTENSION: Record<string, '.jpg' | '.png' | '.webp'> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

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

    const mimeType = file.type?.toLowerCase() ?? '';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'JPEG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: '이미지 크기는 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'popups');
    await fs.mkdir(uploadsDir, { recursive: true });

    const originalName =
      (file as any).name && typeof (file as any).name === 'string'
        ? (file as any).name as string
        : 'popup.png';
    const extractedExt = path.extname(originalName).toLowerCase();
    if (extractedExt && !ALLOWED_EXTENSIONS.has(extractedExt)) {
      return NextResponse.json(
        { error: '허용되지 않는 파일 확장자입니다.' },
        { status: 400 }
      );
    }
    const ext = (extractedExt && ALLOWED_EXTENSIONS.has(extractedExt)
      ? extractedExt
      : MIME_TO_EXTENSION[mimeType]) ?? '.png';
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

