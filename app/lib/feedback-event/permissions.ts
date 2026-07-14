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
  viewerUserId: string | null,
  isAdmin: boolean,
): T[] {
  return posts.filter((post) => canViewFeedbackPost(post, viewerUserId, isAdmin));
}
