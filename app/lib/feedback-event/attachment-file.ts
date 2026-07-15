import path from 'path';

export const MAX_FEEDBACK_ATTACHMENT_BYTES = 5 * 1024 * 1024;

type FeedbackImageType = {
  extension: '.png' | '.jpg' | '.webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

type FeedbackFileLike = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type FeedbackFileValidationResult =
  | {
      ok: true;
      file: FeedbackImageType & {
        bytes: Buffer;
        originalName: string;
      };
    }
  | { ok: false; status: 400; error: string };

const IMAGE_TYPES: Record<string, FeedbackImageType> = {
  '.png': { extension: '.png', contentType: 'image/png' },
  '.jpg': { extension: '.jpg', contentType: 'image/jpeg' },
  '.jpeg': { extension: '.jpg', contentType: 'image/jpeg' },
  '.webp': { extension: '.webp', contentType: 'image/webp' },
};

function hasPngSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

function hasJpegSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function hasWebpSignature(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function signatureMatches(bytes: Buffer, contentType: FeedbackImageType['contentType']): boolean {
  if (contentType === 'image/png') return hasPngSignature(bytes);
  if (contentType === 'image/jpeg') return hasJpegSignature(bytes);
  return hasWebpSignature(bytes);
}

export async function validateFeedbackImageFile(
  input: FeedbackFileLike,
): Promise<FeedbackFileValidationResult> {
  if (!input.size) {
    return { ok: false, status: 400, error: '빈 파일은 첨부할 수 없습니다.' };
  }
  if (input.size > MAX_FEEDBACK_ATTACHMENT_BYTES) {
    return { ok: false, status: 400, error: '첨부 파일은 5MB 이하만 가능합니다.' };
  }

  const expected = IMAGE_TYPES[path.extname(input.name).toLowerCase()];
  if (!expected) {
    return { ok: false, status: 400, error: 'PNG, JPG, WebP 이미지만 첨부할 수 있습니다.' };
  }
  if (input.type.toLowerCase() !== expected.contentType) {
    return { ok: false, status: 400, error: '파일 확장자와 Content-Type이 일치하지 않습니다.' };
  }

  const bytes = Buffer.from(await input.arrayBuffer());
  if (bytes.length !== input.size || !signatureMatches(bytes, expected.contentType)) {
    return { ok: false, status: 400, error: '실제 이미지 형식을 확인할 수 없는 파일입니다.' };
  }

  return {
    ok: true,
    file: {
      ...expected,
      bytes,
      originalName: input.name,
    },
  };
}
