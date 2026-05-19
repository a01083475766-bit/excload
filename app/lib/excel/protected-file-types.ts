/** 보호된 엑셀·ZIP 파일 해제 흐름 공통 타입 */

export type ProtectedFileKind = 'excel' | 'zip';

/** 암호 없이 읽기 실패 — 보안·DRM·전용 뷰어 문서 의심 */
export const EXCEL_SECURITY_DOCUMENT_MESSAGE =
  '회사 보안·전용 뷰어 문서로 인해 직접 열 수 없습니다. Excel에서 「다른 이름으로 저장」→ 일반 .xlsx로 저장한 뒤 다시 올려 주세요.';

/** 비밀번호 입력 후 복호화 실패 — 잘못된 키가 아닌 미지원 암호·손상 등 */
export const EXCEL_DECRYPT_FAILED_MESSAGE =
  '파일을 해제하지 못했습니다. 지원되지 않는 보안 형식이거나 파일이 손상되었을 수 있습니다. Excel에서 일반 .xlsx로 저장한 뒤 다시 올려 주세요.';

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

  constructor(message = EXCEL_SECURITY_DOCUMENT_MESSAGE) {
    super(message);
    this.name = 'ExcelUnsupportedProtectedError';
  }
}
