// 택배사 업로드 엑셀 헤더를 내부 주문 엔티티 기준으로 한 번 해석하기 위한 중간 매핑 레이어
// 주의: 이 레이어는 아직 어디에서도 사용되지 않으며, 추후 단계에서만 참조됩니다.

// InternalOrderFormat(내부 표준 주문 형식)을 기준으로 한 논리 키 정의
// 점 표기(dotted path)를 사용해 엔티티와 필드를 구분합니다.
export type InternalHeaderKey =
  // 수신자(받는 사람) 정보
  | 'receiver.name'
  | 'receiver.phone1'
  | 'receiver.phone2'
  | 'receiver.address'
  | 'receiver.zipcode'
  // 발신자(보내는 사람) 정보
  | 'sender.name'
  | 'sender.phone'
  | 'sender.address'
  // 상품/옵션/수량
  | 'product.name'
  | 'product.option'
  | 'product.quantity'
  // 요청/메모
  | 'request.memo';

export interface InternalHeaderMapItem {
  originalHeader: string;
  internalKey: InternalHeaderKey | null;
}

// 택배사 업로드 엑셀 한 시트의 헤더 전체에 대한 매핑
export type InternalHeaderMap = InternalHeaderMapItem[];

// 헤더 문자열을 정규화 (소문자, 공백 제거 등)
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

// 발신자(보내는 사람) 관련 여부 판별
function isSenderHeader(norm: string): boolean {
  return (
    norm.includes('보내는') ||
    norm.includes('보내는분') ||
    norm.includes('보낸분') ||
    norm.includes('발신') ||
    norm.includes('sender')
  );
}

// 수신자(받는 사람) 관련 여부 판별
function isReceiverHeader(norm: string): boolean {
  return (
    norm.includes('받는') ||
    norm.includes('받는분') ||
    norm.includes('수령') ||
    norm.includes('수취') ||
    norm.includes('receiver')
  );
}

// 헤더명 기반 InternalHeaderKey 추정
// 정확도 100%가 아닐 수 있으며, 매칭 실패 시 null을 반환합니다.
export function inferInternalKeyFromHeader(header: string): InternalHeaderKey | null {
  if (!header || header.trim() === '') {
    return null;
  }

  const norm = normalizeHeader(header);

  // 먼저 발신자/수신자 구분 키워드부터 판별
  const sender = isSenderHeader(norm);
  const receiver = isReceiverHeader(norm);

  // 이름
  if (norm.includes('이름') || norm.includes('성명') || norm.includes('name')) {
    if (sender) return 'sender.name';
    if (receiver) return 'receiver.name';
    // "받는/보내는" 키워드가 없으면 수신자 이름으로 가정
    return 'receiver.name';
  }

  // 전화/연락처
  if (
    norm.includes('전화') ||
    norm.includes('휴대') ||
    norm.includes('연락처') ||
    norm.includes('핸드폰') ||
    norm.includes('폰') ||
    norm.includes('tel') ||
    norm.includes('phone')
  ) {
    // 보조 번호 추정 (2, 보조, sub 등)
    const isSecond =
      norm.includes('2') ||
      norm.includes('보조') ||
      norm.includes('sub') ||
      norm.includes('subphone');

    if (sender) return 'sender.phone';
    if (receiver) return isSecond ? 'receiver.phone2' : 'receiver.phone1';

    // 기본값: 수신자 전화 1번
    return 'receiver.phone1';
  }

  // 주소
  if (
    norm.includes('주소') ||
    norm.includes('addr') ||
    norm.includes('address')
  ) {
    if (sender) return 'sender.address';
    if (receiver) return 'receiver.address';
    // "받는/보내는" 키워드가 없으면 수신자 주소로 가정
    return 'receiver.address';
  }

  // 우편번호
  if (
    norm.includes('우편') ||
    norm.includes('우편번호') ||
    norm.includes('zip') ||
    norm.includes('zipcode') ||
    norm.includes('post')
  ) {
    return 'receiver.zipcode';
  }

  // 상품명
  if (
    norm.includes('상품명') ||
    norm.includes('상품') ||
    norm.includes('제품') ||
    norm.includes('item') ||
    norm.includes('product')
  ) {
    // "옵션"과 같이 들어간 경우는 아래 옵션 구문에서 처리되므로 여기서는
    // '옵션' 키워드가 없는 상품명만 우선 매핑
    if (!norm.includes('옵션') && !norm.includes('option')) {
      return 'product.name';
    }
  }

  // 옵션
  if (
    norm.includes('옵션') ||
    norm.includes('선택옵션') ||
    norm.includes('추가옵션') ||
    norm.includes('option') ||
    norm.includes('opt')
  ) {
    return 'product.option';
  }

  // 수량
  if (
    norm.includes('수량') ||
    norm.endsWith('수') ||
    norm.includes('qty') ||
    norm.includes('quantity') ||
    norm.includes('개수')
  ) {
    return 'product.quantity';
  }

  // 요청/메모/메시지
  if (
    norm.includes('요청') ||
    norm.includes('메모') ||
    norm.includes('메세지') ||
    norm.includes('메시지') ||
    norm.includes('배송메시지') ||
    norm.includes('배송메세지') ||
    norm.includes('message') ||
    norm.includes('memo') ||
    norm.includes('comment')
  ) {
    return 'request.memo';
  }

  // 그 밖의 헤더는 아직 매핑하지 않음
  return null;
}

// CourierUploadHeader.headers와 같은 구조에서 InternalHeaderMap 생성
// 최소 요구 필드는 name(헤더 문자열)만 사용합니다.
export function createInternalHeaderMapFromHeaders(
  headers: { name: string }[] | undefined | null
): InternalHeaderMap {
  if (!headers || !Array.isArray(headers)) {
    return [];
  }

  return headers.map((header) => ({
    originalHeader: header.name ?? '',
    internalKey: inferInternalKeyFromHeader(header.name ?? ''),
  }));
}

