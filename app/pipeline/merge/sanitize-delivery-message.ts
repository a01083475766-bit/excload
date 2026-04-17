/**
 * 배송메시지 보수 정제(v1)
 *
 * 원칙:
 * - 모호하면 제거하지 않는다.
 * - 택배사 업로드에 불필요한 채널/앱 메타 토큰만 최소 제거한다.
 */

const APP_META_PATTERNS: RegExp[] = [
  /(?:^|[\s/|,;:()\-])(?:안드로이드\s*앱|안드로이드앱|ios\s*앱|ios앱|앱주문|웹주문)(?=$|[\s/|,;:()\-])/gi,
];

const DELIVERY_METHOD_META_PATTERNS: RegExp[] = [
  /(?:택배|등기|소포)\s*(?:,\s*(?:택배|등기|소포)\s*)+(?:일반\s*배송)?/gi,
  /(?:^|[\s/|,;:()\-])일반\s*배송(?=$|[\s/|,;:()\-])/gi,
];

const CODE_ONLY_TOKEN = /^\d{5,8}$/;

function collapseSpaces(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

/**
 * 배송메시지 텍스트에서 "지워도 안전한 메타 조각"만 제거한다.
 * - 예: "문 앞101906 안드로이드앱" -> "문 앞101906"
 * - 예: "택배, 등기, 소포 일반 배송" -> ""
 */
export function sanitizeDeliveryMessage(raw: string): string {
  if (!raw) return '';

  let out = raw;

  for (const pattern of APP_META_PATTERNS) {
    out = out.replace(pattern, ' ');
  }
  for (const pattern of DELIVERY_METHOD_META_PATTERNS) {
    out = out.replace(pattern, ' ');
  }

  // 구분자 단위 토큰 중 "숫자 코드 단독"만 제거 (과제코드/채널코드 등)
  const tokens = out
    .split(/[\n\r/|]+/)
    .map((token) => collapseSpaces(token))
    .filter(Boolean)
    .filter((token) => !CODE_ONLY_TOKEN.test(token));

  out = tokens.join(' / ');
  out = collapseSpaces(out);

  // " - " 같은 빈 장식만 남는 경우 제거
  if (/^[\-\s/|,.;:()]*$/.test(out)) return '';
  return out;
}

