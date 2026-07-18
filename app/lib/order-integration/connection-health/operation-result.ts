import type { ConnectionOperationResult, HealthErrorCategory } from './types';

/** 공급자별 분류가 끝난 오류를 저장 계층용 구조화 결과로 조립한다. */
export function connectionOperationFailure(input: {
  error: unknown;
  category: HealthErrorCategory;
  userMessage: string;
  errorCode?: string;
}): Extract<ConnectionOperationResult, { success: false }> {
  return {
    success: false,
    category: input.category,
    errorCode: input.errorCode,
    userMessage: input.userMessage,
    rawMessage: input.error instanceof Error ? input.error.message : undefined,
  };
}
