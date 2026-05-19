/** 보호된 엑셀·ZIP 파일 해제 흐름 공통 타입 */

export type ProtectedFileKind = 'excel' | 'zip';

export class ExcelUnlockCancelledError extends Error {
  readonly code = 'EXCEL_UNLOCK_CANCELLED' as const;

  constructor() {
    super('파일 열기가 취소되었습니다.');
    this.name = 'ExcelUnlockCancelledError';
  }
}

export class ExcelWrongPasswordError extends Error {
  readonly code = 'EXCEL_WRONG_PASSWORD' as const;

  constructor() {
    super('비밀번호가 올바르지 않습니다.');
    this.name = 'ExcelWrongPasswordError';
  }
}

export class ExcelUnsupportedProtectedError extends Error {
  readonly code = 'EXCEL_UNSUPPORTED_PROTECTED' as const;

  constructor(
    message = '엑클로드에서 이 파일을 직접 열 수 없습니다. Excel에서 비밀번호·보안을 해제한 일반 엑셀(.xlsx)로 저장한 뒤 다시 올려 주세요.',
  ) {
    super(message);
    this.name = 'ExcelUnsupportedProtectedError';
  }
}
