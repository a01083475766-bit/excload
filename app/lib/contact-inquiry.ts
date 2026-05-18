export const CONTACT_INQUIRY_TYPE_LABELS: Record<string, string> = {
  general: '일반 문의',
  billing: '결제 문의',
  bug: '오류 신고',
  feature: '기능 요청',
  partner: '제휴 / 협업 문의',
  business: '비즈니스 문의',
};

export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
export const CONTACT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/csv',
]);

export function getInquiryTypeLabel(type: string): string {
  return CONTACT_INQUIRY_TYPE_LABELS[type] ?? type;
}

export function isValidContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isAllowedContactAttachment(file: File): boolean {
  if (file.size > CONTACT_ATTACHMENT_MAX_BYTES) return false;
  if (ALLOWED_ATTACHMENT_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.pdf')
  );
}

/** Resend 첨부용 ASCII 안전 파일명 */
export function safeAttachmentFilename(name: string): string {
  const trimmed = name.trim().slice(0, 200);
  const dot = trimmed.lastIndexOf('.');
  const ext = dot > 0 ? trimmed.slice(dot).replace(/[^a-zA-Z0-9.]/g, '') : '';
  const base =
    (dot > 0 ? trimmed.slice(0, dot) : trimmed).replace(/[^\w.-]/g, '_').replace(/_+/g, '_') ||
    'attachment';
  return `${base.slice(0, 150)}${ext || '.bin'}`.slice(0, 200);
}

export function getContactAdminEmail(): string {
  return process.env.CONTACT_ADMIN_EMAIL?.trim() || 'sacom5766@naver.com';
}

export type ContactInquiryStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export const CONTACT_INQUIRY_STATUS_LABELS: Record<ContactInquiryStatus, string> = {
  NEW: '신규',
  IN_PROGRESS: '처리중',
  RESOLVED: '완료',
};

export function isContactInquiryStatus(value: string): value is ContactInquiryStatus {
  return value === 'NEW' || value === 'IN_PROGRESS' || value === 'RESOLVED';
}
