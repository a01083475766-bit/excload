import { describe, expect, it } from 'vitest';
import {
  canCreateFeedbackComment,
  canDeleteFeedbackComment,
  mapFeedbackComment,
  validateFeedbackCommentContent,
} from '@/app/lib/feedback-event/comments';

describe('feedback comment policy', () => {
  it('validates trimmed content between 2 and 2,000 characters', () => {
    expect(validateFeedbackCommentContent('  정상 댓글  ')).toEqual({
      ok: true,
      content: '정상 댓글',
    });
    expect(validateFeedbackCommentContent(' ')).toMatchObject({ ok: false });
    expect(validateFeedbackCommentContent('한')).toMatchObject({ ok: false });
    expect(validateFeedbackCommentContent('가'.repeat(2_000))).toMatchObject({ ok: true });
    expect(validateFeedbackCommentContent('가'.repeat(2_001))).toMatchObject({ ok: false });
  });

  it('allows all logged viewers on public posts and only admins on private posts', () => {
    expect(canCreateFeedbackComment({ publicConsent: true, isAdmin: false })).toBe(true);
    expect(canCreateFeedbackComment({ publicConsent: false, isAdmin: false })).toBe(false);
    expect(canCreateFeedbackComment({ publicConsent: false, isAdmin: true })).toBe(true);
  });

  it('allows own public comment deletion and lets admins delete every comment', () => {
    const base = {
      commentUserId: 'author-a',
      viewerUserId: 'author-a',
      isAdmin: false,
    };
    expect(canDeleteFeedbackComment({ ...base, publicConsent: true })).toBe(true);
    expect(
      canDeleteFeedbackComment({ ...base, publicConsent: true, viewerUserId: 'other-user' }),
    ).toBe(false);
    expect(canDeleteFeedbackComment({ ...base, publicConsent: false })).toBe(false);
    expect(
      canDeleteFeedbackComment({ ...base, publicConsent: false, isAdmin: true }),
    ).toBe(true);
  });

  it('maps comments without exposing user ids or email fields', () => {
    const dto = mapFeedbackComment(
      {
        id: 'comment-1',
        userId: 'private-user-id',
        content: '<script>문자열</script>',
        isAdminComment: false,
        createdAt: new Date('2026-07-16T00:00:00.000Z'),
      },
      'viewer-id',
      false,
      true,
    );
    const serialized = JSON.stringify(dto);

    expect(dto.content).toBe('<script>문자열</script>');
    expect(serialized).not.toContain('private-user-id');
    expect(serialized).not.toContain('email');
  });
});
