/**
 * 한 줄 혼합 텍스트를 패턴 기반으로 필드 후보 분해 (특정 한글 키워드 의존 없음)
 * 3PL orderData 정규화 보조 — Stage1~3 로직과 무관
 */

const MOBILE_PHONE_PATTERN =
  /0(?:10|11|16|17|18|19)[-\s]?\d{3,4}[-\s]?\d{4}|0(?:10|11|16|17|18|19)\d{8}/g;

/** 시·구·로/길/대로 + 선택 건물번호까지 (뒤쪽 상품 토큰 흡수 방지) */
const ADDRESS_PATTERN =
  /[가-힣]+(?:시|도|특별시|광역시)\s+[가-힣]+(?:구|군)\s+[가-힣0-9\s\-]+(?:로|길|대로)(?:\s+[0-9\-]+)?/;

/** 숫자+단위(또는 붙어 있는 kg 등)가 있으면 상품 후보 */
function isProductLikeToken(t: string): boolean {
  const s = t.trim();
  if (/\d/.test(s) && /(?:kg|mg|g|ml|mL|ML|L|l|개|팩|박스|ea|EA|개입|입|장|병|통|봉|세트|SET|set|포|oz|OZ)/i.test(s)) {
    return true;
  }
  return false;
}

/** 전형적 한국 성명 후보 (2~4음절, 숫자·단위 없음) */
function isShortKoreanNameToken(t: string): boolean {
  const s = t.trim();
  if (s.length < 2 || s.length > 4) return false;
  return /^[가-힣]+$/.test(s);
}

function normalizePhoneDigits(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11 || !/^(010|011|016|017|018|019)/.test(digits)) {
    return undefined;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export type DecomposedFreeTextFields = {
  receiverName?: string;
  address?: string;
  phone?: string;
  productName?: string;
  senderName?: string;
};

/**
 * 길이·전화·주소 구조가 섞여 있을 때만 분해 시도 (짧은 상품명 오분해 방지)
 */
export function shouldDecomposeMixedBlob(text: string): boolean {
  const t = text.trim();
  if (t.length < 15) return false;
  const hasPhone = /0(?:10|11|16|17|18|19)[-\s]?\d/.test(t);
  const hasAddr = ADDRESS_PATTERN.test(t);
  return hasPhone || hasAddr;
}

/**
 * 전화 → 주소(정규식) → 잔여 토큰에서 이름(짧은 한글)·상품(단위)·송화인(마지막 짧은 한글) 추출
 */
export function decomposeFreeTextFields(text: string): DecomposedFreeTextFields {
  const out: DecomposedFreeTextFields = {};
  let working = text.trim();
  if (working === "") return out;

  const phones: string[] = [];
  working = working.replace(MOBILE_PHONE_PATTERN, (m) => {
    phones.push(m);
    return " ";
  });
  working = working.replace(/\s+/g, " ").trim();

  const p0 = phones[0];
  if (p0) {
    const fmt = normalizePhoneDigits(p0);
    if (fmt) out.phone = fmt;
  }

  const addrMatch = working.match(ADDRESS_PATTERN);
  if (addrMatch) {
    out.address = addrMatch[0].trim();
    working = (working.slice(0, addrMatch.index) + working.slice(addrMatch.index! + addrMatch[0].length))
      .replace(/\s+/g, " ")
      .trim();
  }

  const tokens = working.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return out;

  const nameLike = tokens.filter(isShortKoreanNameToken);
  const productTokens = tokens.filter(isProductLikeToken);

  if (productTokens.length > 0) {
    out.productName = productTokens.join(" ").trim();
  }

  if (nameLike.length >= 1) {
    out.receiverName = nameLike[0];
  }
  if (nameLike.length >= 2) {
    const last = nameLike[nameLike.length - 1];
    if (last !== out.receiverName) {
      out.senderName = last;
    }
  } else if (nameLike.length === 1 && tokens.length > 1) {
    const lastTok = tokens[tokens.length - 1];
    if (
      isShortKoreanNameToken(lastTok) &&
      lastTok !== nameLike[0] &&
      !isProductLikeToken(lastTok)
    ) {
      out.senderName = lastTok;
    }
  }

  return out;
}
