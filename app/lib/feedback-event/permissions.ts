type FeedbackPostVisibilityInput = {
  userId: string;
  publicConsent: boolean;
};

export function canViewFeedbackPost(
  post: FeedbackPostVisibilityInput,
  viewerUserId: string | null,
  isAdmin: boolean,
): boolean {
  return post.publicConsent || isAdmin || (!!viewerUserId && viewerUserId === post.userId);
}

export function filterVisibleFeedbackPosts<T extends FeedbackPostVisibilityInput>(
  posts: T[],
  _viewerUserId: string | null,
  _isAdmin: boolean,
): T[] {
  return posts;
}
