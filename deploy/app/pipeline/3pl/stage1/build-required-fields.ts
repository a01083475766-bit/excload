import type { RequiredFieldSpec } from "@/app/pipeline/3pl/contracts/template-analysis.contract";
import { normalizeHeader } from "@/app/pipeline/3pl/utils/normalize-header";

const REQUIRED_KEYWORD_GROUPS = {
  recipient: ["수령", "받는", "이름", "성명", "고객명"],
  address: ["주소", "우편"],
  contact: ["연락처", "전화", "휴대폰", "핸드폰", "tel", "phone"],
  quantity: ["수량", "qty", "quantity"],
} as const;

const EXPLICIT_REQUIRED_KEYWORDS = ["필수", "required"] as const;

function hasAnyKeyword(target: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => target.includes(keyword.toLowerCase()));
}

export function buildRequiredFields(
  templateHeaders: string[]
): RequiredFieldSpec[] {
  return templateHeaders.map((header) => {
    const normalized = normalizeHeader(header);

    if (hasAnyKeyword(normalized, REQUIRED_KEYWORD_GROUPS.recipient)) {
      return { key: header, required: true, reason: "recipient" };
    }

    if (hasAnyKeyword(normalized, REQUIRED_KEYWORD_GROUPS.address)) {
      return { key: header, required: true, reason: "address" };
    }

    if (hasAnyKeyword(normalized, REQUIRED_KEYWORD_GROUPS.contact)) {
      return { key: header, required: true, reason: "contact" };
    }

    if (hasAnyKeyword(normalized, REQUIRED_KEYWORD_GROUPS.quantity)) {
      return { key: header, required: true, reason: "quantity" };
    }

    if (hasAnyKeyword(normalized, EXPLICIT_REQUIRED_KEYWORDS)) {
      return { key: header, required: true, reason: "explicit" };
    }

    return { key: header, required: false };
  });
}
