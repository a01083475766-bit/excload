import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('feedback write attachment UI', () => {
  it('keeps the image input, privacy warning, selected file details, and delete action', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app', 'feedback-event', 'write', 'page.tsx'),
      'utf8',
    );

    expect(source).toContain('type="file"');
    expect(source).toContain('.png,.jpg,.jpeg,.webp');
    expect(source).toContain('개인정보는 가린 후 올려주세요.');
    expect(source).toContain('PNG, JPG, WebP · 최대 5MB');
    expect(source).toContain('{attachment.name}');
    expect(source).toContain('삭제');
  });
});
