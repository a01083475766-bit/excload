import { NextResponse } from 'next/server';
import AdmZip from 'adm-zip';

export const runtime = 'nodejs';

const MAX_BYTES = 30 * 1024 * 1024;

function excelEntryName(name: string): boolean {
  return /\.(xlsx|xls)$/i.test(name);
}

function findExcelEntry(zip: AdmZip) {
  return zip
    .getEntries()
    .find((entry: { isDirectory: boolean; entryName: string }) => !entry.isDirectory && excelEntryName(entry.entryName));
}

/** ZIP 항목이 암호 보호인지 (adm-zip: 암호 없이 읽기 실패 시 보호로 간주) */
function entryNeedsPassword(
  entry: { entryName: string; isDirectory: boolean; getData: (password?: string) => Buffer },
  zip: AdmZip,
): boolean {
  try {
    entry.getData();
    return false;
  } catch {
    try {
      zip.readFile(entry);
      return false;
    } catch {
      return true;
    }
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const action = String(form.get('action') ?? '');
    const password = String(form.get('password') ?? '');

    if (!(file instanceof File)) {
      return NextResponse.json({ message: '파일이 없습니다.' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { message: '파일 크기는 30MB 이하여야 합니다.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return NextResponse.json(
        { message: 'ZIP 파일 형식이 아닙니다.' },
        { status: 400 },
      );
    }

    const excelEntry = findExcelEntry(zip);
    if (!excelEntry) {
      return NextResponse.json(
        { message: 'ZIP 안에 엑셀(.xlsx, .xls) 파일이 없습니다.' },
        { status: 400 },
      );
    }

    if (action === 'inspect') {
      const needsPassword = entryNeedsPassword(excelEntry, zip);
      return NextResponse.json({ needsPassword });
    }

    if (action === 'decrypt') {
      let data: Buffer;
      const usePassword = password && password !== '\0';
      try {
        data = usePassword ? excelEntry.getData(password) : excelEntry.getData();
      } catch {
        return NextResponse.json(
          { message: '비밀번호가 올바르지 않습니다.' },
          { status: 401 },
        );
      }

      if (!data?.length) {
        return NextResponse.json(
          { message: 'ZIP에서 엑셀을 읽을 수 없습니다.' },
          { status: 400 },
        );
      }

      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  } catch (error) {
    console.error('[protected-file]', error);
    return NextResponse.json(
      { message: '파일 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
