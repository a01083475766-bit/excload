export type FeedbackEventStatusPayload = {
  event: {
    isActive: boolean;
    endsAtLabel: string;
    endsAt: string;
  };
  user: {
    loggedIn: boolean;
    canSubmitForTrial: boolean;
    feedbackTrialActive: boolean;
    feedbackTrialEndsAt: string | null;
    feedbackPopupSeen: boolean;
    hasProEntitlement: boolean;
    isPaid: boolean;
    feedbackTrialUsed: boolean;
  };
};
