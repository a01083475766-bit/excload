import { describe, expect, it } from 'vitest';
import { validateFeedbackAttachmentPolicy } from '@/app/lib/feedback-event/attachment-policy';
import {
  buildFeedbackAttachmentDownloadPath,
  buildPrivateFeedbackAttachmentReference,
} from '@/app/lib/feedback-event/attachment-reference';
import {
  DEFAULT_FEEDBACK_CATEGORY,
  normalizeFeedbackCategory,
  normalizeFeedbackConversionResult,
} from '@/app/lib/feedback-event/constants';
import {
  feedbackTitle,
  mapBoardPost,
  parseFeedbackContent,
  serializeFeedbackContent,
} from '@/app/lib/feedback-event/map-board-post';
import {
  canViewFeedbackPost,
  filterVisibleFeedbackPosts,
} from '@/app/lib/feedback-event/permissions';
import {
  buildAuthLoginRedirectUrl,
  getPostLoginPath,
} from '@/app/lib/auth/post-login-redirect';
import {
  getBetaFeedbackPostPath,
  getBetaFeedbackRedirectPath,
} from '@/app/lib/feedback-event/routes';
import { viewerFromSessionUser, viewerFromToken } from '@/app/lib/feedback-event/viewer';
import nextConfig from '../../../next.config';

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

  it('preserves the request origin when building beta feedback login redirects', () => {
    expect(
      buildAuthLoginRedirectUrl(
        'https://www.excload.com/beta-feedback/write',
        '/beta-feedback/post-1',
      ),
    ).toBe('https://www.excload.com/auth?mode=login&callbackUrl=%2Fbeta-feedback%2Fpost-1');
    expect(
      buildAuthLoginRedirectUrl('http://localhost:3000/beta-feedback/write', '/beta-feedback/post-1'),
    ).toBe('http://localhost:3000/auth?mode=login&callbackUrl=%2Fbeta-feedback%2Fpost-1');
  });

  it('delegates host canonicalization to Vercel instead of next config', () => {
    expect(nextConfig.redirects).toBeUndefined();
  });

  it('accepts relative callback URLs and rejects external callback URLs', () => {
    expect(getPostLoginPath(new URLSearchParams('callbackUrl=%2Fbeta-feedback%2Fpost-1'))).toBe(
      '/beta-feedback/post-1',
    );
    expect(
      getPostLoginPath(new URLSearchParams('callbackUrl=https%3A%2F%2Fevil.example%2F')),
    ).toBe('/order-convert');
    expect(getPostLoginPath(new URLSearchParams('callbackUrl=%2F%2Fevil.example%2F'))).toBe(
      '/order-convert',
    );
  });

  it('builds the submit success path without sending the user to auth', () => {
    expect(getBetaFeedbackPostPath('post-1')).toBe('/beta-feedback/post-1');
    expect(getBetaFeedbackPostPath('post-1')).not.toContain('/auth');
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

  it('allows a refreshed detail page to recognize an own private post from token.sub', () => {
    const viewer = viewerFromToken({ sub: 'user-a' });
    expect(canViewFeedbackPost({ userId: 'user-a', publicConsent: false }, viewer.userId, false)).toBe(
      true,
    );
  });
});

describe('feedback post visibility', () => {
  const posts = [
    { id: 'public', userId: 'user-a', publicConsent: true },
    { id: 'mine-private', userId: 'user-a', publicConsent: false },
    { id: 'other-private', userId: 'user-b', publicConsent: false },
  ];

  it('includes private rows in the board list for a normal user', () => {
    expect(filterVisibleFeedbackPosts(posts, 'user-a', false).map((post) => post.id)).toEqual([
      'public',
      'mine-private',
      'other-private',
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

  const privateBoardRow = {
    id: 'private-post',
    userId: 'secret-author-id',
    featureUsed: 'question',
    conversionResult: 'success',
    content: '노출되면 안 되는 제목\n\n노출되면 안 되는 본문',
    publicConsent: false,
    systemReply: null,
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    comments: [] as { id: string }[],
    _count: { comments: 2 },
    attachmentUrl: 'supabase-private:feedback/secret/object.png',
  };

  it('shows an own private title and an admin can see it too', () => {
    expect(mapBoardPost(privateBoardRow, 'secret-author-id', false).title).toBe(
      '노출되면 안 되는 제목',
    );
    expect(mapBoardPost(privateBoardRow, 'admin-id', true).title).toBe(
      '노출되면 안 되는 제목',
    );
  });

  it('serializes another user private post as safe placeholders only', () => {
    const dto = mapBoardPost(privateBoardRow, 'other-user', false);
    const serialized = JSON.stringify(dto);

    expect(dto).toMatchObject({
      title: '비공개 글입니다',
      authorLabel: '비공개',
      categoryLabel: '비공개',
      excerpt: null,
      canOpen: false,
      commentCount: 0,
    });
    expect(serialized).not.toContain('노출되면 안 되는 제목');
    expect(serialized).not.toContain('노출되면 안 되는 본문');
    expect(serialized).not.toContain('secret-author-id');
    expect(serialized).not.toContain('secret/object.png');
  });

  it('marks complete only for a visible legacy reply or an admin comment', () => {
    expect(
      mapBoardPost(
        { ...privateBoardRow, publicConsent: true, comments: [], _count: { comments: 1 } },
        'viewer',
        false,
      ).hasAdminReply,
    ).toBe(false);
    expect(
      mapBoardPost(
        {
          ...privateBoardRow,
          publicConsent: true,
          comments: [{ id: 'admin-comment' }],
          _count: { comments: 1 },
        },
        'viewer',
        false,
      ).hasAdminReply,
    ).toBe(true);
    expect(
      mapBoardPost(
        {
          ...privateBoardRow,
          publicConsent: true,
          systemReply: 'PRO 체험 혜택 제공 안내',
        },
        'viewer',
        false,
      ).hasAdminReply,
    ).toBe(false);
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
  it('allows private posts to use the private attachment flow', () => {
    expect(
      validateFeedbackAttachmentPolicy({
        publicConsent: false,
        attachment: { size: 1 },
      }),
    ).toEqual({ ok: true });
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

  it('keeps legacy public attachment URLs and hides private object keys behind the API', () => {
    expect(buildFeedbackAttachmentDownloadPath('post-1', '/uploads/feedback/legacy.png')).toBe(
      '/uploads/feedback/legacy.png',
    );
    const reference = buildPrivateFeedbackAttachmentReference(
      'feedback/user-a/post-1/11111111-1111-4111-8111-111111111111.png',
    );
    expect(buildFeedbackAttachmentDownloadPath('post-1', reference)).toBe(
      '/api/feedback-event/posts/post-1/attachment',
    );
    expect(buildFeedbackAttachmentDownloadPath('post-1', reference)).not.toContain(
      '11111111-1111-4111-8111-111111111111.png',
    );
  });
});
