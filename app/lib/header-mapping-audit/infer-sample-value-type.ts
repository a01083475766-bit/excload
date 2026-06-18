export type SampleValueType =
  | 'DATE'
  | 'MONEY'
  | 'PHONE'
  | 'ADDRESS'
  | 'NAME'
  | 'MESSAGE'
  | 'CODE'
  | 'STATUS'
  | 'TEXT'
  | 'EMPTY';

export type InferSampleValueTypeOptions = {
  header?: string | null;
};

const DATE_PATTERNS = [
  /^\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
  /^\d{2}[-./]\d{1,2}[-./]\d{1,2}$/,
  /^\d{4}년\s*\d{1,2}월\s*\d{1,2}일/,
];

const PHONE_PATTERN =
  /^(?:\+?82[-\s]?)?(?:0?1[016789]|0[2-9]\d?)[-\s]?\d{3,4}[-\s]?\d{4}$/;

const MONEY_PATTERN = /^-?\s*(?:₩|￦)?\s*\d{1,3}(?:,\d{3})*(?:원)?$|^-?\s*\d+(?:\.\d+)?\s*원$/;

const ADDRESS_PATTERN =
  /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충청북도|충남|충청남도|전북|전라북도|전남|전라남도|경북|경상북도|경남|경상남도|제주|제주특별자치도|도로명|번길|로\s?\d|길\s?\d|아파트|빌라|동\s?\d|호\s?\d)/;

const MESSAGE_PATTERN =
  /(문앞|문 앞|부재|경비실|택배함|배송|요청|메시지|메세지|연락|전화|조심|파손|직접|놓아|놔|주세요|부탁)/;

const STATUS_PATTERN =
  /^(신규주문|주문완료|결제완료|상품준비중|배송준비중|배송중|배송완료|구매확정|취소|취소완료|반품|교환|환불|보류|완료|진행중|접수|확정|출고완료)$/;

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{3,}$/;

const KOREAN_NAME_PATTERN = /^[가-힣]{2,4}$/;

function normalizeHeader(header?: string | null): string {
  return String(header ?? '').replace(/\s/g, '').toLowerCase();
}

export function inferSampleValueType(
  rawValue: unknown,
  options: InferSampleValueTypeOptions = {},
): SampleValueType {
  const value = String(rawValue ?? '').trim();
  if (!value) return 'EMPTY';

  const header = normalizeHeader(options.header);

  if (/전화|연락처|휴대폰|핸드폰|phone|tel/.test(header) || PHONE_PATTERN.test(value)) {
    return 'PHONE';
  }

  if (/주소|배송지|수령지|address/.test(header) || ADDRESS_PATTERN.test(value)) {
    return 'ADDRESS';
  }

  if (/상태|진행단계|status/.test(header) || STATUS_PATTERN.test(value)) {
    return 'STATUS';
  }

  if (/메시지|메세지|요청사항|배송요청|전하는말|message|memo/.test(header) || MESSAGE_PATTERN.test(value)) {
    return 'MESSAGE';
  }

  if (/금액|가격|판매가|결제|운임|배송비|money|price|amount/.test(header) || MONEY_PATTERN.test(value)) {
    return 'MONEY';
  }

  if (/일자|날짜|일시|마감일|배송일|희망일|date|time/.test(header) || DATE_PATTERNS.some((pattern) => pattern.test(value))) {
    return 'DATE';
  }

  if (/이름|성명|수취인|인수자|받는사람|name/.test(header) || KOREAN_NAME_PATTERN.test(value)) {
    return 'NAME';
  }

  if (/번호|코드|id|code|no/.test(header) || CODE_PATTERN.test(value)) {
    return 'CODE';
  }

  return 'TEXT';
}
