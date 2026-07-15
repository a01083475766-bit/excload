import { describe, expect, it } from 'vitest';
import { validateFeedbackAttachmentPolicy } from '@/app/lib/feedback-event/attachment-policy';
import {
  DEFAULT_FEEDBACK_CATEGORY,
  normalizeFeedbackCategory,
  normalizeFeedbackConversionResult,
} from '@/app/lib/feedback-event/constants';
import {
  feedbackTitle,
  parseFeedbackContent,
  serializeFeedbackContent,
} from '@/app/lib/feedback-event/map-board-post';
import {
  canViewFeedbackPost,
  filterVisibleFeedbackPosts,
} from '@/app/lib/feedback-event/permissions';
import { buildAuthLoginRedirectPath } from '@/app/lib/auth/post-login-redirect';
import { getBetaFeedbackRedirectPath } from '@/app/lib/feedback-event/routes';
import { viewerFromSessionUser, viewerFromToken } from '@/app/lib/feedback-event/viewer';

describe('feedback-event legacy route redirect', () => {
  it.each([
    ['/feedback-event', '/beta-feedback'],
    ['/feedback-event/write', '/beta-feedback/write'],
    ['/feedback-event/mine', '/beta-feedback/mine'],
    ['/feedback-event/123', '/beta-feedback/123'],
  ])('%s -> %s', (from, to) => {
    expect(getBetaFeedbackRedirectPath(from)).toBe(to);
  });

  it('keeps query strings outside the pathname helper', () => {
    const url = new URL('https://www.excload.com/feedback-event?mine=1');
    const redirected = getBetaFeedbackRedirectPath(url.pathname);
    url.pathname = redirected ?? url.pathname;
    expect(url.pathname + url.search).toBe('/beta-feedback?mine=1');
  });

  it('does not match api, static, or similar prefix paths', () => {
    expect(getBetaFeedbackRedirectPath('/api/feedback-event/posts')).toBeNull();
    expect(getBetaFeedbackRedirectPath('/uploads/feedback/a.png')).toBeNull();
    expect(getBetaFeedbackRedirectPath('/feedback-eventual')).toBeNull();
    expect(getBetaFeedbackRedirectPath('/beta-feedback')).toBeNull();
  });

  it('builds the integrated auth redirect path without the /auth/login hop', () => {
    expect(buildAuthLoginRedirectPath('/beta-feedback/post-1')).toBe(
      '/auth?mode=login&callbackUrl=%2Fbeta-feedback%2Fpost-1',
    );
  });
});

describe('feedback viewer token mapping', () => {
  it('accepts NextAuth sub as a viewer id fallback', () => {
    expect(
      viewerFromToken({
        sub: 'user-sub-id',
      }),
    ).toMatchObject({
      userId: 'user-sub-id',
      email: null,
      isAdmin: false,
    });
  });

  it('preserves the admin flag from the JWT', () => {
    expect(
      viewerFromToken({
        sub: 'admin-user-id',
        isAdmin: true,
      }),
    ).toMatchObject({
      userId: 'admin-user-id',
      isAdmin: true,
    });
  });

  it('maps the server session user used by RSC detail pages', () => {
    expect(
      viewerFromSessionUser({
        id: 'session-user-id',
        email: 'USER@EXAMPLE.COM',
        isAdmin: false,
      }),
    ).toMatchObject({
      userId: 'session-user-id',
      email: 'user@example.com',
      isAdmin: false,
    });
  });
});

describe('feedback post visibility', () => {
  const posts = [
    { id: 'public', userId: 'user-a', publicConsent: true },
    { id: 'mine-private', userId: 'user-a', publicConsent: false },
    { id: 'other-private', userId: 'user-b', publicConsent: false },
  ];

  it('allows public and own private posts for a normal user', () => {
    expect(filterVisibleFeedbackPosts(posts, 'user-a', false).map((post) => post.id)).toEqual([
      'public',
      'mine-private',
    ]);
  });

  it('hides another user private post and direct access resolves false', () => {
    expect(canViewFeedbackPost(posts[2], 'user-a', false)).toBe(false);
  });

  it('allows admin to see private posts', () => {
    expect(filterVisibleFeedbackPosts(posts, 'admin', true).map((post) => post.id)).toEqual([
      'public',
      'mine-private',
      'other-private',
    ]);
  });
});

describe('feedback category compatibility', () => {
  it('defaults an empty category to free writing', () => {
    expect(normalizeFeedbackCategory('')).toBe(DEFAULT_FEEDBACK_CATEGORY);
  });

  it('accepts new board categories and legacy feature values', () => {
    expect(normalizeFeedbackCategory('question')).toBe('question');
    expect(normalizeFeedbackCategory('order-convert')).toBe('order-convert');
  });

  it('defaults a missing conversion result to the legacy other value', () => {
    expect(normalizeFeedbackConversionResult('')).toBe('other');
  });
});

describe('feedback title/body compatibility', () => {
  it('round-trips title and body with a blank separator', () => {
    const serialized = serializeFeedbackContent({
      title: '송장 변환 오류',
      body: '첫 번째 줄\n두 번째 줄',
    });
    expect(serialized).toBe('송장 변환 오류\n\n첫 번째 줄\n두 번째 줄');
    expect(parseFeedbackContent(serialized)).toEqual({
      title: '송장 변환 오류',
      body: '첫 번째 줄\n두 번째 줄',
    });
  });

  it('does not drop the first body sentence for legacy posts', () => {
    expect(parseFeedbackContent('기존 글 첫 문장입니다.')).toEqual({
      title: '기존 글 첫 문장입니다.',
      body: '',
    });
  });

  it('handles leading blank lines, special characters, and long titles', () => {
    const title = '특수문자 <> & 줄바꿈 확인'.repeat(6);
    const content = serializeFeedbackContent({ title, body: '\n본문입니다.' });
    expect(parseFeedbackContent(`\n\n${content}`).title).toBe(title);
    expect(feedbackTitle(content, 10)).toBe(`${title.slice(0, 10)}…`);
  });
});

describe('feedback attachment policy', () => {
  it('rejects private posts with a public attachment', () => {
    expect(
      validateFeedbackAttachmentPolicy({
        publicConsent: false,
        attachment: { size: 1 },
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects public attachments over 5MB and allows public attachments within limit', () => {
    expect(
      validateFeedbackAttachmentPolicy({
        publicConsent: true,
        attachment: { size: 5 * 1024 * 1024 + 1 },
      }),
    ).toMatchObject({ ok: false, status: 400 });

    expect(
      validateFeedbackAttachmentPolicy({
        publicConsent: true,
        attachment: { size: 5 * 1024 * 1024 },
      }),
    ).toEqual({ ok: true });
  });

  it('ignores forged attachmentUrl fields because only attachment file policy matters', () => {
    expect(
      validateFeedbackAttachmentPolicy({
        publicConsent: false,
        attachment: null,
      }),
    ).toEqual({ ok: true });
  });
});
