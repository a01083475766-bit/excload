/**
 * InputText type definition
 * Represents the raw input text that will be processed through the refinement pipeline
 */

export type InputText = {
  text: string;
  source?: string;
  receivedAt?: Date | string;
};

