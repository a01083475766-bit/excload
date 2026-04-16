/**
 * Stage1: courierHeader 라벨 + mappedBaseHeaders 보정
 *
 * - AI/DB/별칭 오류로 "전화/주소" 열이 받는사람 등으로만 묶이는 경우 라벨 기준으로 재매핑
 * - 동일 기준헤더가 여러 열에 중복되면 대체 필드 제안 또는 null(동일 값 반복 방지)
 *
 * ⚠️ merge-pipeline / order-pipeline 코어는 수정하지 않음
 */

import { BASE_HEADERS } from '../base/base-headers';

const BASE_SET = new Set<string>([...BASE_HEADERS]);

function isValidBase(h: string | null | undefined): h is string {
  return h != null && h !== '' && BASE_SET.has(h);
}

/**
 * 택배 열 이름만 보고 기준헤더 추정 (지정/비지정 구분)
 */
function inferBaseFromCourierLabel(
  courierHeader: string,
  wrongBase: string | null
): string | null {
  if (!courierHeader || !wrongBase) return wrongBase;
  const ch = courierHeader;
  const flat = ch.replace(/\s/g, '');
  const hasJijeong = /\(지정\)/.test(ch);

  const looksPhone = /전화|연락처|휴대폰|핸드폰|phone|tel/i.test(ch);
  const looksZip = /우편/.test(ch);
  const looksAddr = /주소|배송지|수령지|도로명|지번/.test(ch);
  const looksAddrDetail = /상세주소/.test(flat);
  const looksProduct = /상품명|품목|상품상세|옵션/.test(ch) || /^상품/.test(flat);
  const looksPersonalCustoms = /개인통관번호|통관고유부호|PCCC/i.test(ch);

  // 개인통관번호 계열은 항상 개인통관번호 기준헤더를 유지한다.
  // (중복 보정/휴리스틱 보정 과정에서 null 처리되는 것을 방지)
  if (looksPersonalCustoms) {
    return '개인통관번호';
  }

  // (지정) 열인데 수취인 전화/주소 기준헤더로 잘못 붙은 경우 → 보내는사람 쪽으로 교정
  if (hasJijeong && looksPhone) {
    if (wrongBase === '받는사람전화1' || wrongBase === '받는사람전화2') {
      return /2/.test(flat) ? '보내는사람전화2' : '보내는사람전화1';
    }
  }
  if (hasJijeong && looksAddr && !looksAddrDetail) {
    if (wrongBase === '받는사람주소1') return '보내는사람주소1';
    if (wrongBase === '받는사람우편번호') return '보내는사람우편번호';
  }

  if (wrongBase === '받는사람') {
    if (hasJijeong) {
      if (/전화번호2|전화2/.test(flat)) return '보내는사람전화2';
      if (looksPhone) return '보내는사람전화1';
      if (looksZip) return '보내는사람우편번호';
      if (looksAddrDetail) return '보내는사람주소2';
      if (looksAddr) return '보내는사람주소1';
    } else {
      if (/전화번호2|^전화2$/.test(flat)) return '받는사람전화2';
      if (looksPhone) return '받는사람전화1';
      if (looksZip) return '받는사람우편번호';
      if (looksAddrDetail) return '받는사람주소2';
      if (flat === '주소' || looksAddr) return '받는사람주소1';
      if (looksProduct) return '상품명';
    }
  }

  if (wrongBase === '보내는사람') {
    if (hasJijeong) {
      if (looksPhone) return '보내는사람전화1';
      if (looksAddrDetail) return '보내는사람주소2';
      if (looksAddr) return '보내는사람주소1';
    }
  }

  return wrongBase;
}

const PRODUCT_FALLBACK_CHAIN = ['추가상품', '상품옵션', '상품옵션1'] as const;

function suggestAlternativeForDuplicate(
  courierHeader: string,
  conflictBase: string,
  usedBefore: Set<string>
): string | null {
  const ch = courierHeader || '';
  const flat = ch.replace(/\s/g, '');
  const hasJijeong = /\(지정\)/.test(ch);
  const looksPhone = /전화|연락처|휴대폰|핸드폰/i.test(ch);
  const looksAddr = /주소|배송지|수령지/.test(ch) && !/상세주소/.test(flat);
  const looksAddrDetail = /상세주소/.test(flat);
  const looksZip = /우편/.test(ch);
  const looksProduct = /상품명|품목|상품상세|옵션/.test(ch) || /^상품명/.test(flat);

  const tryChain = (candidates: readonly string[]) => {
    for (const c of candidates) {
      if (BASE_SET.has(c) && !usedBefore.has(c)) return c;
    }
    return null;
  };

  if (conflictBase === '받는사람') {
    if (hasJijeong) {
      if (looksPhone && /2/.test(flat)) return tryChain(['보내는사람전화2']);
      if (looksPhone) return tryChain(['보내는사람전화1']);
      if (looksZip) return tryChain(['보내는사람우편번호']);
      if (looksAddrDetail) return tryChain(['보내는사람주소2']);
      if (looksAddr) return tryChain(['보내는사람주소1']);
    } else {
      if (looksPhone && /2/.test(flat)) return tryChain(['받는사람전화2']);
      if (looksPhone) return tryChain(['받는사람전화1']);
      if (looksZip) return tryChain(['받는사람우편번호']);
      if (looksAddrDetail) return tryChain(['받는사람주소2']);
      if (looksAddr || flat === '주소') return tryChain(['받는사람주소1']);
      if (looksProduct) return tryChain(['상품명', ...PRODUCT_FALLBACK_CHAIN]);
    }
  }

  if (conflictBase === '상품명') {
    return tryChain([...PRODUCT_FALLBACK_CHAIN]);
  }

  if (conflictBase === '받는사람전화1') {
    return tryChain(['받는사람전화2']);
  }

  if (conflictBase === '보내는사람전화1') {
    return tryChain(['보내는사람전화2']);
  }

  if (conflictBase === '받는사람주소1') {
    return tryChain(['받는사람주소2']);
  }

  return null;
}

/**
 * courierHeaders와 동일 길이의 mappedBaseHeaders를 보정한 새 배열 반환
 */
export function refineMappedBaseHeadersCouriers(
  courierHeaders: string[],
  mappedBaseHeaders: (string | null)[]
): (string | null)[] {
  if (courierHeaders.length !== mappedBaseHeaders.length) {
    return mappedBaseHeaders;
  }

  let out: (string | null)[] = mappedBaseHeaders.map((m) => (isValidBase(m) ? m : null));

  for (let i = 0; i < courierHeaders.length; i++) {
    const ch = courierHeaders[i];
    const cur = out[i];
    if (!isValidBase(cur)) continue;
    const fixed = inferBaseFromCourierLabel(ch, cur);
    if (fixed !== cur && isValidBase(fixed)) {
      out[i] = fixed;
    }
  }

  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (!isValidBase(b)) continue;
    const courierHeader = courierHeaders[i] || '';
    const isPersonalCustomsHeader = /개인통관번호|통관고유부호|PCCC/i.test(courierHeader);

    const usedBefore = new Set<string>();
    for (let j = 0; j < i; j++) {
      if (isValidBase(out[j])) usedBefore.add(out[j]!);
    }

    // 개인통관번호 컬럼은 중복 보정에서 null 처리하지 않는다.
    // 동일 의미 컬럼이 복수로 들어와도 값 누락보다 중복 표시가 안전하다.
    if (isPersonalCustomsHeader) {
      out[i] = '개인통관번호';
      continue;
    }

    if (usedBefore.has(b)) {
      const alt = suggestAlternativeForDuplicate(courierHeader, b, usedBefore);
      if (alt && !usedBefore.has(alt)) {
        out[i] = alt;
      } else {
        out[i] = null;
      }
    }
  }

  return out;
}
