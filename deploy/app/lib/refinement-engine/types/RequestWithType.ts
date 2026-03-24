/**
 * Shared RequestWithType for refinement pipeline
 * Minimal shape to represent a typed request item so that multiple
 * modules can reference it without circular imports.
 */
export type RequestWithType = {
  text: string;
  requestType: string;
};
