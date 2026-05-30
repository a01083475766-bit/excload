export type Normalize29ErrorCode =
  | 'AI_PARSE_FAILED'
  | 'AI_EMPTY_ORDERS'
  | 'AI_UNAVAILABLE'
  | 'AI_API_ERROR';

export class Normalize29Error extends Error {
  readonly errorCode: Normalize29ErrorCode;

  constructor(errorCode: Normalize29ErrorCode, message: string) {
    super(message);
    this.name = 'Normalize29Error';
    this.errorCode = errorCode;
  }
}

export function isNormalize29Error(error: unknown): error is Normalize29Error {
  return error instanceof Normalize29Error;
}

export type NormalizeQualityNoticeKind = 'network' | 'convert_failed';

export function resolveNormalizeQualityNotice(
  error: unknown,
  isNetworkError: (error: unknown) => boolean,
): NormalizeQualityNoticeKind | null {
  if (isNetworkError(error)) return 'network';
  if (isNormalize29Error(error)) {
    if (error.errorCode === 'AI_UNAVAILABLE' || error.errorCode === 'AI_API_ERROR') {
      return 'network';
    }
    return 'convert_failed';
  }
  return null;
}
