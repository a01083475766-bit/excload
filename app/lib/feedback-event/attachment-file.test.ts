import { describe, expect, it } from 'vitest';
import {
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  validateFeedbackImageFile,
} from '@/app/lib/feedback-event/attachment-file';

function imageFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('feedback image attachment validation', () => {
  it('rejects an empty file', async () => {
    await expect(validateFeedbackImageFile(imageFile([], 'empty.png', 'image/png'))).resolves.toMatchObject({
      ok: false,
    });
  });

  it('accepts PNG, JPG, and WebP signatures', async () => {
    const png = imageFile(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
      'screen.png',
      'image/png',
    );
    const jpeg = imageFile([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9], 'screen.jpeg', 'image/jpeg');
    const webp = imageFile(
      [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
      'screen.webp',
      'image/webp',
    );

    await expect(validateFeedbackImageFile(png)).resolves.toMatchObject({ ok: true });
    await expect(validateFeedbackImageFile(jpeg)).resolves.toMatchObject({
      ok: true,
      file: { extension: '.jpg' },
    });
    await expect(validateFeedbackImageFile(webp)).resolves.toMatchObject({ ok: true });
  });

  it('rejects files over 5MB before reading the body', async () => {
    const arrayBuffer = async () => new ArrayBuffer(0);
    const result = await validateFeedbackImageFile({
      name: 'large.png',
      type: 'image/png',
      size: MAX_FEEDBACK_ATTACHMENT_BYTES + 1,
      arrayBuffer,
    });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects unsupported extensions and SVG', async () => {
    await expect(
      validateFeedbackImageFile(imageFile([0x25, 0x50, 0x44, 0x46], 'document.pdf', 'application/pdf')),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateFeedbackImageFile(imageFile([0x3c, 0x73, 0x76, 0x67], 'image.svg', 'image/svg+xml')),
    ).resolves.toMatchObject({ ok: false });
  });

  it('rejects MIME and magic-byte impersonation', async () => {
    const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    await expect(
      validateFeedbackImageFile(imageFile(pngBytes, 'screen.png', 'image/jpeg')),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      validateFeedbackImageFile(imageFile([0x4d, 0x5a, 0x90, 0x00], 'screen.png', 'image/png')),
    ).resolves.toMatchObject({ ok: false });
  });
});
