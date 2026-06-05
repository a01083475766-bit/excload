/**
 * normalize-29 보조: AI가 놓친 보내는사람 라벨 줄을 원문에서 결정론적으로 추출
 * - "보내는사람 홍길동 … 010-xxxx" 같이 전화가 줄 끝인 형식 지원
 * - 기존 orders에 보내는사람* 값이 있으면 덮어쓰지 않음 (Fill Only)
 */

const SENDER_LINE_LABELS = [
  '보내는사람',
  '보내는분',
  '보낸사람',
  '발송인',
  '발신인',
  '송화인',
  '출고자',
  '보내시는분',
] as const;

const SENDER_LINE_RE = new RegExp(
  `^(${SENDER_LINE_LABELS.join('|')})\\s*[:：]?\\s*(.+)$`,
  'u',
);

const PHONE_RE = /01[016789](?:[-\s]?\d{3,4}[-\s]?\d{4}|\d{8})/g;

const NAME_TOKEN_RE = /^[\uac00-\ud7a3]{2,5}$/u;

export type LabeledSenderFields = {
  보내는사람: string;
  보내는사람전화1: string;
  보내는사람주소1: string;
};

function normalizeMobile(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && /^01[016789]/.test(d)) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10 && /^01[016789]/.test(d)) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw.trim();
}

function findPhoneSpan(text: string): { start: number; end: number; raw: string } | null {
  let match: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(text)) !== null) {
    match = m;
  }
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length, raw: match[0] };
}

function isNameToken(token: string): boolean {
  return NAME_TOKEN_RE.test(token.trim());
}

/** 라벨 제거 후 본문에서 이름·전화·주소 분리 */
export function parseSenderLineContent(content: string): LabeledSenderFields | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const phoneSpan = findPhoneSpan(trimmed);
  const phone = phoneSpan ? normalizeMobile(phoneSpan.raw) : '';

  const beforePhone = phoneSpan ? trimmed.slice(0, phoneSpan.start).trim() : trimmed;
  const afterPhone = phoneSpan ? trimmed.slice(phoneSpan.end).trim() : '';

  const beforeTokens = beforePhone.split(/\s+/).filter(Boolean);
  let name = '';
  let addressFromBefore = '';

  if (beforeTokens.length >= 1 && isNameToken(beforeTokens[0]!)) {
    name = beforeTokens[0]!.trim();
    addressFromBefore = beforeTokens.slice(1).join(' ').trim();
  } else if (beforeTokens.length === 1) {
    name = beforeTokens[0]!.trim();
  }

  const address = [addressFromBefore, afterPhone].filter(Boolean).join(' ').trim();

  if (!name && !phone && !address) return null;

  return {
    보내는사람: name,
    보내는사람전화1: phone,
    보내는사람주소1: address,
  };
}

/** 원문 줄 단위로 보내는사람 라벨 줄 탐색 (마지막 매칭 우선) */
export function extractSenderFromLabeledLines(text: string): LabeledSenderFields | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let found: LabeledSenderFields | null = null;

  for (const line of lines) {
    const m = line.match(SENDER_LINE_RE);
    if (!m?.[2]) continue;
    const parsed = parseSenderLineContent(m[2]);
    if (parsed) found = parsed;
  }

  return found;
}

function fillIfEmpty(order: Record<string, string>, sender: LabeledSenderFields): Record<string, string> {
  const out = { ...order };
  for (const key of ['보내는사람', '보내는사람전화1', '보내는사람주소1'] as const) {
    const current = (out[key] ?? '').trim();
    const incoming = (sender[key] ?? '').trim();
    if (!current && incoming) {
      out[key] = incoming;
    }
  }
  return out;
}

/** orders 전체에 공통 보내는사람 라벨 블록 적용 (비어 있는 필드만) */
export function enrichOrdersWithLabeledSender(
  orders: Record<string, string>[],
  userText: string,
): Record<string, string>[] {
  const sender = extractSenderFromLabeledLines(userText);
  if (!sender) return orders;
  return orders.map((order) => fillIfEmpty(order, sender));
}
