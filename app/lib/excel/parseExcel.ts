import * as XLSX from 'xlsx';

/**
 * AI 결과를 엑셀로 변환할 때 사용하는 고정 헤더 (7개)
 * 실제 업로드 엑셀과 100% 동일 인식을 위해 반드시 이 헤더를 사용해야 합니다.
 * 중립 헤더('이름', '전화', '주소' 등)는 절대 사용하지 않습니다.
 */
export const STANDARD_AI_EXCEL_HEADERS = [
  '받는사람명',
  '받는분전화',
  '받는분주소',
  '상품',
  '옵션',
  '수량',
  '배송요청사항',
] as const;

/**
 * 헤더 매칭을 위한 키워드 사전 (V1)
 * 각 의미 타입별로 정규화된 키워드 토큰 배열을 포함합니다.
 */
const HEADER_DICTIONARY_V1: Record<string, string[]> = {
  name: [
    '이름', '성함', '받는분', '받는', '수신자', '고객명', '고객', 'name',
    '수령인', '수령자', '수령자명', '수취인', '수취자', '수신인', '수신인명', '수신인성명',
    '받는사람', '받는사람명', '받는사람이름', '받는분명', '받는분이름', '받는분성함',
    '수령인명', '수령인성함', '수령인이름', '수취인명', '수취인성함', '수취인이름',
    '주문자명', '주문자이름', '주문자성함', '주문자', '구매자명', '구매자이름', '구매자성함', '구매자',
    '고객이름', '고객성함', '고객성명', '회원명', '회원이름', '회원성함',
    '배송수령인', '배송수령자', '배송받는분', '배송받는사람', '배송수신자',
    '수신자명', '수신자이름', '수신자성함', '수신자성명',
    '이름명', '성명', '성함명', '이름성함', '이름성명',
    'receiver', 'receiver_name', 'recipient', 'customer', 'customer_name', 'buyer', 'orderer', 'consignee', 'consignee_name', 'to_name'
  ],
  phone: [
    '연락처', '전화', '휴대폰', '핸드폰', 'tel', '전화번호', '연락', '연락처번호', 'phone',
    '휴대전화', '휴대전화번호', '핸드폰번호', '휴대폰번호', '모바일', '모바일번호',
    '전화번호1', '전화번호2', '연락처1', '연락처2', '휴대폰1', '휴대폰2',
    '수신자연락처', '수신자전화', '수신자휴대폰', '수신자핸드폰', '수신자전화번호',
    '받는분연락처', '받는분전화', '받는분휴대폰', '받는분핸드폰', '받는분전화번호',
    '수령인연락처', '수령인전화', '수령인휴대폰', '수령인핸드폰', '수령인전화번호',
    '수취인연락처', '수취인전화', '수취인휴대폰', '수취인핸드폰', '수취인전화번호',
    '주문자연락처', '주문자전화', '주문자휴대폰', '주문자핸드폰', '주문자전화번호',
    '구매자연락처', '구매자전화', '구매자휴대폰', '구매자핸드폰', '구매자전화번호',
    '고객연락처', '고객전화', '고객휴대폰', '고객핸드폰', '고객전화번호',
    '회원연락처', '회원전화', '회원휴대폰', '회원핸드폰', '회원전화번호',
    '배송연락처', '배송전화', '배송휴대폰', '배송핸드폰', '배송전화번호',
    '연락처번호1', '연락처번호2', '전화1', '전화2', '휴대폰1', '휴대폰2',
    'cellphone', 'mobile', 'mobilephone', 'cell', 'contact', 'contactnumber',
    'telephone', 'telno', 'phonenumber', 'phone1', 'phone2', 'mobile1', 'mobile2',
    // 받는분전화 alias 헤더 추가
    '도착인전화', '수하인전화',
    'customer_phone', 'to_tel', 'recipient_phone',
    'consignee_phone', 'consignee_tel',
    'receiver_phone', 'receiver_tel',
    '수령지전화', '배송지연락처', '배송지전화',
    '회원전화', '구매자연락처', '주문자전화',
    '고객휴대폰', '고객연락처', '고객전화',
    '수령자전화', '수신인전화', '수취인전화', '수령인전화',
    '받는분전화', '받는사람전화'
  ],
  address: [
    '주소', '배송지', '도로명', '로', '길', '번지', '동', '구', '시', '군', '도', 'address', '배송주소',
    '주소1', '주소2', '기본주소', '상세주소', '도로명주소', '지번주소', '우편번호',
    '수신자주소', '수신자배송지', '수신자주소1', '수신자주소2', '수신자도로명주소',
    '받는분주소', '받는분배송지', '받는분주소1', '받는분주소2', '받는분도로명주소',
    '수령인주소', '수령인배송지', '수령인주소1', '수령인주소2', '수령인도로명주소',
    '수취인주소', '수취인배송지', '수취인주소1', '수취인주소2', '수취인도로명주소',
    '주문자주소', '주문자배송지', '주문자주소1', '주문자주소2', '주문자도로명주소',
    '구매자주소', '구매자배송지', '구매자주소1', '구매자주소2', '구매자도로명주소',
    '고객주소', '고객배송지', '고객주소1', '고객주소2', '고객도로명주소',
    '회원주소', '회원배송지', '회원주소1', '회원주소2', '회원도로명주소',
    '배송주소1', '배송주소2', '배송도로명주소', '배송지주소', '배송지주소1', '배송지주소2',
    '시도', '시군구', '시도시군구', '시도명', '시군구명', '시도시군구명',
    '읍면동', '읍면', '면', '읍', '동명', '리', '읍면동명',
    '시군', '시명', '군명', '구명', '동명', '리명',
    '상세주소1', '상세주소2', '나머지주소', '참고항목', '참고주소',
    '우편번호', '우편번호1', '우편번호2', '우편번호3', '우편번호4', '우편번호5',
    '지번', '지번주소', '지번1', '지번2', '지번상세',
    '건물명', '건물번호', '아파트명', '아파트', '빌딩명', '빌딩',
    '주소상세', '주소상세1', '주소상세2', '주소상세3',
    '배송지주소', '배송지상세', '배송지상세주소', '배송지도로명', '배송지지번',
    'deliveryaddress', 'delivery', 'deliveryaddr', 'shippingaddress', 'shipping',
    'shippingaddr', 'address1', 'address2', 'addr1', 'addr2', 'postalcode', 'zipcode',
    'zip', 'postcode', 'roadaddress', 'jibunaddress', 'detailaddress'
  ],
  product: [
    // 우선순위 최상단: product 관련 헤더를 option보다 먼저 매칭되도록 배치
    // 최상단 우선순위 키워드 (정확한 순서)
    '상품명', '상품', '주문상품', '상품정보', '상품명(옵션포함)', '상품명/옵션',
    // 기타 product 관련 키워드
    '제품', '품목', '제품명', 'product', 'item', '물품',
    '상품이름', '제품이름', '품목명', '상품명칭', '제품명칭', '품목명칭',
    '주문제품', '주문품목', '주문상품명', '주문제품명', '주문품목명',
    '구매상품', '구매제품', '구매품목', '구매상품명', '구매제품명', '구매품목명',
    '판매상품', '판매제품', '판매품목', '판매상품명', '판매제품명', '판매품목명',
    '상품명1', '상품명2', '제품명1', '제품명2', '품목명1', '품목명2',
    '상품코드', '제품코드', '품목코드', '상품번호', '제품번호', '품목번호',
    '상품코드명', '제품코드명', '품목코드명', '상품번호명', '제품번호명', '품목번호명',
    '제품정보', '품목정보', '상품내용', '제품내용', '품목내용',
    '상품설명', '제품설명', '품목설명', '상품상세', '제품상세', '품목상세',
    '상품타입', '제품타입', '품목타입', '상품종류', '제품종류', '품목종류',
    '상품분류', '제품분류', '품목분류', '상품카테고리', '제품카테고리', '품목카테고리',
    '상품명상세', '제품명상세', '품목명상세', '상품명전체', '제품명전체', '품목명전체',
    'goods', 'goodsname', 'productname', 'itemname', 'productname1', 'productname2',
    'itemname1', 'itemname2', 'productcode', 'itemcode', 'productno', 'itemno',
    'productinfo', 'iteminfo', 'productdesc', 'itemdesc', 'productdetail', 'itemdetail'
  ],
  option: [
    // option은 '옵션', '옵션명', '옵션정보'만 사용
    '옵션', '옵션명', '옵션정보', 'option',
    // 상품상세 계열 헤더
    '상품상세', '상품상세1', '상품상세2'
  ],
  quantity: [
    '수량', '개', 'ea', '장', '세트', '개수', 'quantity', 'qty', '수',
    '주문수량', '구매수량', '판매수량', '상품수량', '제품수량', '품목수량',
    '수량1', '수량2', '개수1', '개수2', 'ea1', 'ea2', 'qty1', 'qty2',
    '주문개수', '구매개수', '판매개수', '상품개수', '제품개수', '품목개수',
    '주문ea', '구매ea', '판매ea', '상품ea', '제품ea', '품목ea',
    '주문qty', '구매qty', '판매qty', '상품qty', '제품qty', '품목qty',
    '수량명', '개수명', '수량정보', '개수정보', '수량상세', '개수상세',
    '수량단위', '개수단위', '수량단위명', '개수단위명',
    '주문량', '구매량', '판매량', '상품량', '제품량', '품목량',
    '수량코드', '개수코드', '수량번호', '개수번호',
    '수량상세', '개수상세', '수량내용', '개수내용', '수량설명', '개수설명',
    'box', 'boxes', 'piece', 'pieces', 'unit', 'units', 'pack', 'packs',
    'orderqty', 'orderquantity', 'orderqty1', 'orderqty2',
    'purchaseqty', 'purchasequantity', 'buyqty', 'buyquantity',
    'productqty', 'productquantity', 'itemqty', 'itemquantity',
    'qty1', 'qty2', 'quantity1', 'quantity2', 'count', 'count1', 'count2'
  ],
  request: [
    '부탁', '해주세요', '요청', '주문', '배송', '요구', 'request', '메모', '비고', '특이사항', '요청사항',
    '배송요청', '배송요청사항', '배송요청내용', '배송요청메모', '배송요청비고',
    '배송부탁', '배송부탁사항', '배송부탁내용', '배송부탁메모', '배송부탁비고',
    '배송메모', '배송비고', '배송특이사항', '배송특이내용', '배송특이메모',
    '주문요청', '주문요청사항', '주문요청내용', '주문요청메모', '주문요청비고',
    '주문부탁', '주문부탁사항', '주문부탁내용', '주문부탁메모', '주문부탁비고',
    '주문메모', '주문비고', '주문특이사항', '주문특이내용', '주문특이메모',
    '구매요청', '구매요청사항', '구매요청내용', '구매요청메모', '구매요청비고',
    '구매부탁', '구매부탁사항', '구매부탁내용', '구매부탁메모', '구매부탁비고',
    '구매메모', '구매비고', '구매특이사항', '구매특이내용', '구매특이메모',
    '요청사항1', '요청사항2', '요청내용1', '요청내용2', '요청메모1', '요청메모2',
    '부탁사항', '부탁내용', '부탁메모', '부탁비고', '부탁특이사항', '부탁특이내용',
    '요청내용', '요청메모', '요청비고', '요청특이사항', '요청특이내용', '요청특이메모',
    '메모1', '메모2', '비고1', '비고2', '특이사항1', '특이사항2',
    '메모내용', '비고내용', '특이사항내용', '메모상세', '비고상세', '특이사항상세',
    '배송시요청', '배송시요청사항', '배송시요청내용', '배송시요청메모', '배송시요청비고',
    '배송시부탁', '배송시부탁사항', '배송시부탁내용', '배송시부탁메모', '배송시부탁비고',
    '배송시메모', '배송시비고', '배송시특이사항', '배송시특이내용', '배송시특이메모',
    '수령요청', '수령요청사항', '수령요청내용', '수령요청메모', '수령요청비고',
    '수령부탁', '수령부탁사항', '수령부탁내용', '수령부탁메모', '수령부탁비고',
    '수령메모', '수령비고', '수령특이사항', '수령특이내용', '수령특이메모',
    '수취요청', '수취요청사항', '수취요청내용', '수취요청메모', '수취요청비고',
    '수취부탁', '수취부탁사항', '수취부탁내용', '수취부탁메모', '수취부탁비고',
    '수취메모', '수취비고', '수취특이사항', '수취특이내용', '수취특이메모',
    '고객요청', '고객요청사항', '고객요청내용', '고객요청메모', '고객요청비고',
    '고객부탁', '고객부탁사항', '고객부탁내용', '고객부탁메모', '고객부탁비고',
    '고객메모', '고객비고', '고객특이사항', '고객특이내용', '고객특이메모',
    '회원요청', '회원요청사항', '회원요청내용', '회원요청메모', '회원요청비고',
    '회원부탁', '회원부탁사항', '회원부탁내용', '회원부탁메모', '회원부탁비고',
    '회원메모', '회원비고', '회원특이사항', '회원특이내용', '회원특이메모',
    '추가요청', '추가요청사항', '추가요청내용', '추가요청메모', '추가요청비고',
    '추가부탁', '추가부탁사항', '추가부탁내용', '추가부탁메모', '추가부탁비고',
    '추가메모', '추가비고', '추가특이사항', '추가특이내용', '추가특이메모',
    '기타요청', '기타요청사항', '기타요청내용', '기타요청메모', '기타요청비고',
    '기타부탁', '기타부탁사항', '기타부탁내용', '기타부탁메모', '기타부탁비고',
    '기타메모', '기타비고', '기타특이사항', '기타특이내용', '기타특이메모',
    '요청코드', '요청번호', '요청코드명', '요청번호명',
    'memo', 'note', 'notes', 'remark', 'remarks', 'comment', 'comments',
    'request1', 'request2', 'requestmemo', 'requestnote', 'requestremark',
    'deliveryrequest', 'deliverymemo', 'deliverynote', 'deliveryremark',
    'orderrequest', 'ordermemo', 'ordernote', 'orderremark',
    'purchaserequest', 'purchasememo', 'purchasenote', 'purchaseremark',
    'customerrequest', 'customermemo', 'customernote', 'customerremark',
    'specialrequest', 'specialmemo', 'specialnote', 'specialremark',
    'additionalrequest', 'additionalmemo', 'additionalnote', 'additionalremark',
    'otherrequest', 'othermemo', 'othernote', 'otherremark'
  ],
  sender: [
    'origin', 'from', 'shipper_name', 'shipper', 'sender_name', 'sender',
    '쇼핑몰명', '몰명', '상호명', '상호', '업체명', '스토어명', '상점명',
    '판매자명', '판매자', '출고자', '송하인', '발신인', '발송인',
    '보내는분', '보내는사람'
  ],
  sender_phone: [
    'origin_phone', 'origin_tel', 'from_phone', 'from_tel',
    'shipper_phone', 'shipper_tel', 'sender_contact', 'sender_phone', 'sender_tel',
    '판매자연락처', '판매자전화', '상점연락처', '상점전화',
    '업체연락처', '업체전화', '출고지전화', '출고자전화',
    '송하인전화', '발신인전화', '발송인전화',
    '보내는사람전화', '보내는분전화'
  ],
  sender_address: [
    '보내는분주소',
    'from_address', 'origin_address', 'shipper_address', 'sender_address',
    '출고처주소', '상점주소', '업체주소', '판매자주소', '발송지주소', '출고지주소'
  ],
};

/**
 * 옵션 계열 헤더인지 확인하는 함수
 * MULTI-SLOT 필드로 분류하여 서로 덮어쓰지 않도록 보호
 * @param header - 확인할 헤더 문자열
 * @returns 옵션 계열 헤더인지 여부
 */
function isOptionSeriesHeader(header: string): boolean {
  const headerStr = String(header || '').trim().toLowerCase();
  const optionSeriesPatterns = [
    /^옵션\d*$/,  // 옵션, 옵션1, 옵션2, 옵션3 등
    /^option\d*$/i,  // option, option1, option2 등
    /^additional_option$/i,
    /^selected_option$/i,
    /^상품옵션\d*$/,  // 상품옵션, 상품옵션1, 상품옵션2 등
    /^추가옵션$/,
    /^선택옵션$/,
  ];
  
  return optionSeriesPatterns.some(pattern => pattern.test(headerStr));
}

/**
 * 상품 계열 헤더인지 확인하는 함수
 * MULTI-SLOT 필드로 분류하여 서로 덮어쓰지 않도록 보호
 * @param header - 확인할 헤더 문자열
 * @returns 상품 계열 헤더인지 여부
 */
function isProductSeriesHeader(header: string): boolean {
  const headerStr = String(header || '').trim().toLowerCase();
  const productSeriesPatterns = [
    /^상품\d*$/,  // 상품, 상품1, 상품2, 상품3 등
    /^product\d*$/i,  // product, product1, product2 등
    /^product_name$/i,
    /^item\d*$/i,  // item, item1, item2 등
    /^item_name$/i,
    /^구매상품$/,
    /^주문상품$/,
  ];
  
  const result = productSeriesPatterns.some(pattern => pattern.test(headerStr));
  
  // 상품명1, 상품상세1 추적용 로그
  if (header.includes('상품명1') || header.includes('상품상세1')) {
    console.log('[PRODUCT_SERIES_HEADER_CHECK]', {
      header,
      headerStr,
      patterns: productSeriesPatterns.map((p, idx) => ({
        pattern: p.toString(),
        testResult: p.test(headerStr),
      })),
      result,
    });
  }
  
  return result;
}

/**
 * 헤더를 필드명으로 변환하는 함수 (옵션 계열용)
 * @param header - 헤더 문자열
 * @returns 필드명 (예: '옵션' → 'option', '옵션1' → 'option1', '옵션2' → 'option2')
 */
function convertOptionHeaderToField(header: string): string {
  const headerStr = String(header || '').trim();
  const normalized = headerStr.toLowerCase();
  
  // 직접 매핑
  if (normalized === '옵션' || normalized === 'option') {
    return 'option';
  }
  if (normalized === '옵션1' || normalized === 'option1') {
    return 'option1';
  }
  if (normalized === '옵션2' || normalized === 'option2') {
    return 'option2';
  }
  if (normalized === '옵션3' || normalized === 'option3') {
    return 'option3';
  }
  if (normalized === 'additional_option') {
    return 'additional_option';
  }
  if (normalized === 'selected_option') {
    return 'selected_option';
  }
  if (normalized === '상품옵션' || normalized === 'productoption') {
    return 'productoption';
  }
  if (normalized === '추가옵션') {
    return 'additional_option';
  }
  if (normalized === '선택옵션') {
    return 'selected_option';
  }
  
  // 패턴 매칭 (옵션 + 숫자)
  const optionMatch = normalized.match(/^옵션(\d+)$/);
  if (optionMatch) {
    return `option${optionMatch[1]}`;
  }
  
  const optionMatchEng = normalized.match(/^option(\d+)$/);
  if (optionMatchEng) {
    return `option${optionMatchEng[1]}`;
  }
  
  const productOptionMatch = normalized.match(/^상품옵션(\d+)$/);
  if (productOptionMatch) {
    return `productoption${productOptionMatch[1]}`;
  }
  
  // 기본값: 원본 헤더를 소문자로 변환 (스네이크 케이스로 변환 가능)
  return headerStr.toLowerCase().replace(/\s+/g, '_');
}

/**
 * 헤더를 필드명으로 변환하는 함수 (상품 계열용)
 * @param header - 헤더 문자열
 * @returns 필드명 (예: '상품' → 'product', '상품1' → 'product1', '상품2' → 'product2')
 */
function convertProductHeaderToField(header: string): string {
  const headerStr = String(header || '').trim();
  const normalized = headerStr.toLowerCase();
  
  // 상품명1/상품상세1 추적용 로그
  const isTargetHeader = headerStr.includes('상품명1') || headerStr.includes('상품상세1');
  
  // 직접 매핑
  if (normalized === '상품' || normalized === 'product') {
    const result = 'product';
    if (isTargetHeader) {
      console.log('[TRACE_CONVERT_PRODUCT_HEADER]', {
        step: 'convertProductHeaderToField - 직접 매핑 (상품/product)',
        header: headerStr,
        normalized,
        result,
      });
    }
    return result;
  }
  if (normalized === '상품1' || normalized === 'product1') {
    const result = 'product1';
    if (isTargetHeader) {
      console.log('[TRACE_CONVERT_PRODUCT_HEADER]', {
        step: 'convertProductHeaderToField - 직접 매핑 (상품1/product1)',
        header: headerStr,
        normalized,
        result,
      });
    }
    return result;
  }
  if (normalized === '상품2' || normalized === 'product2') {
    return 'product2';
  }
  if (normalized === '상품3' || normalized === 'product3') {
    return 'product3';
  }
  if (normalized === 'product_name') {
    return 'product_name';
  }
  if (normalized === 'item' || normalized === 'item_name') {
    return normalized === 'item' ? 'item' : 'item_name';
  }
  if (normalized === 'item1') {
    return 'item1';
  }
  if (normalized === 'item2') {
    return 'item2';
  }
  if (normalized === '구매상품') {
    return 'purchase_product';
  }
  if (normalized === '주문상품') {
    return 'product';
  }
  
  // 패턴 매칭: 상품명*, 상품상세*, 상품정보* → 'product' 반환
  if (normalized.startsWith('상품명') || normalized.startsWith('상품상세') || normalized.startsWith('상품정보')) {
    return 'product';
  }
  
  // 패턴 매칭 (상품 + 숫자)
  const productMatch = normalized.match(/^상품(\d+)$/);
  if (productMatch) {
    const result = `product${productMatch[1]}`;
    if (isTargetHeader) {
      console.log('[TRACE_CONVERT_PRODUCT_HEADER]', {
        step: 'convertProductHeaderToField - 패턴 매칭 (상품+숫자)',
        header: headerStr,
        normalized,
        pattern: '/^상품(\\d+)$/',
        match: productMatch[1],
        result,
      });
    }
    return result;
  }
  
  const productMatchEng = normalized.match(/^product(\d+)$/);
  if (productMatchEng) {
    return `product${productMatchEng[1]}`;
  }
  
  const itemMatch = normalized.match(/^item(\d+)$/);
  if (itemMatch) {
    return `item${itemMatch[1]}`;
  }
  
  // 기본값: 원본 헤더를 소문자로 변환 (스네이크 케이스로 변환)
  const result = headerStr.toLowerCase().replace(/\s+/g, '_');
  if (isTargetHeader) {
    console.log('[TRACE_CONVERT_PRODUCT_HEADER]', {
      step: 'convertProductHeaderToField - 기본값 (소문자 변환)',
      header: headerStr,
      normalized,
      result,
    });
  }
  return result;
}

/**
 * 헤더 alias 매핑: 여러 헤더를 canonical header "받는분전화", "받는분주소", "상품", "옵션", "수량", "배송요청사항", "주문번호"로 매핑
 * 단, 옵션 계열 헤더는 MULTI-SLOT으로 분류하여 alias 통합하지 않음
 * @param headers - 원본 헤더 배열
 * @returns alias 매핑이 적용된 헤더 배열 (옵션 계열은 원본 유지)
 */
function applyHeaderAliasMapping(headers: string[]): string[] {
  const canonicalHeaderPhone = '받는분전화';
  const canonicalHeaderAddress = '받는분주소';
  const canonicalHeaderProduct = '상품';
  const canonicalHeaderOption = '옵션';
  const canonicalHeaderQuantity = '수량';
  const canonicalHeaderRequest = '배송요청사항';
  const canonicalHeaderOrderNumber = '주문번호';
  
  // 받는분전화로 alias 매핑할 헤더 목록
  const aliasHeadersPhone = [
    '도착인전화',
    '수하인전화',
    'customer_phone',
    'to_tel',
    'recipient_phone',
    'consignee_phone',
    'consignee_tel',
    'receiver_phone',
    'receiver_tel',
    '수령지전화',
    '배송지연락처',
    '배송지전화',
    '회원전화',
    '구매자연락처',
    '주문자전화',
    '고객휴대폰',
    '고객연락처',
    '고객전화',
    '수령자전화',
    '수신인전화',
    '수취인전화',
    '수령인전화',
    '받는분전화',
    '받는사람전화',
  ];
  
  // 받는분주소로 alias 매핑할 헤더 목록
  const aliasHeadersAddress = [
    'to_address',
    'recipient_address',
    'consignee_address',
    'receiver_address',
    '배송지주소',
    '수령지주소',
    '받는주소',
    '수령주소',
    '배송주소',
    '배송지',
  ];
  
  // 상품으로 alias 매핑할 헤더 목록
  const aliasHeadersProduct = [
    '상품내역',
    'product_name',
    'product',
    'item_name',
    'item',
    '구매상품',
    '주문상품',
    '제품명',
    '상품명',
    '상품',
  ];
  
  // 옵션으로 alias 매핑할 헤더 목록
  const aliasHeadersOption = [
    'additional_option',
    'selected_option',
    '옵션1',
    '옵션2',
    '추가옵션',
    '선택옵션',
    '상품옵션',
    '옵션',
  ];
  
  // 수량으로 alias 매핑할 헤더 목록
  const aliasHeadersQuantity = [
    'amount',
    'count',
    'quantity',
    'qty',
    '수량EA',
    '개수',
    '구매수량',
    '주문수량',
    '수량',
  ];
  
  // 배송요청사항으로 alias 매핑할 헤더 목록
  const aliasHeadersRequest = [
    'delivery_memo',
    'delivery_request',
    '배송메시지',
    '요청사항',
    '배송메모',
    '배송요청사항',
  ];
  
  // 주문번호로 alias 매핑할 헤더 목록
  const aliasHeadersOrderNumber = [
    'order_code',
    'order_id',
    'order_number',
    '주문코드',
    '주문ID',
    '주문번호',
  ];
  
  // 헤더 배열을 순회하며 alias 매핑 적용
  const mappedHeaders = headers.map((header) => {
    const headerStr = String(header || '').trim();
    if (!headerStr) {
      return header;
    }
    
    // 옵션 계열 헤더는 MULTI-SLOT으로 분류하여 alias 통합하지 않음
    if (isOptionSeriesHeader(headerStr)) {
      return header;
    }
    
    // 상품 계열 헤더는 MULTI-SLOT으로 분류하여 alias 통합하지 않음
    if (isProductSeriesHeader(headerStr)) {
      return header;
    }
    
    // 받는분전화 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    if (aliasHeadersPhone.includes(headerStr)) {
      return canonicalHeaderPhone;
    }
    
    // 받는분주소 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    if (aliasHeadersAddress.includes(headerStr)) {
      return canonicalHeaderAddress;
    }
    
    // 상품 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    // (단, 상품 계열 MULTI-SLOT 헤더는 위에서 이미 처리됨)
    if (aliasHeadersProduct.includes(headerStr)) {
      return canonicalHeaderProduct;
    }
    
    // 옵션 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    // (단, 옵션 계열 MULTI-SLOT 헤더는 위에서 이미 처리됨)
    if (aliasHeadersOption.includes(headerStr)) {
      return canonicalHeaderOption;
    }
    
    // 수량 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    if (aliasHeadersQuantity.includes(headerStr)) {
      return canonicalHeaderQuantity;
    }
    
    // 배송요청사항 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    if (aliasHeadersRequest.includes(headerStr)) {
      return canonicalHeaderRequest;
    }
    
    // 주문번호 alias 헤더 목록에 포함되어 있으면 canonical header로 변경
    if (aliasHeadersOrderNumber.includes(headerStr)) {
      return canonicalHeaderOrderNumber;
    }
    
    return header;
  });
  
  // "받는분전화" 헤더가 없으면 추가
  const hasCanonicalHeaderPhone = mappedHeaders.some(h => h === canonicalHeaderPhone);
  if (!hasCanonicalHeaderPhone) {
    mappedHeaders.push(canonicalHeaderPhone);
  }
  
  // "받는분주소" 헤더가 없으면 추가
  const hasCanonicalHeaderAddress = mappedHeaders.some(h => h === canonicalHeaderAddress);
  if (!hasCanonicalHeaderAddress) {
    mappedHeaders.push(canonicalHeaderAddress);
  }
  
  // "상품" 헤더가 없고, 상품 계열 MULTI-SLOT 헤더도 없는 경우에만 추가
  const hasCanonicalHeaderProduct = mappedHeaders.some(h => h === canonicalHeaderProduct);
  const hasProductSeriesHeader = mappedHeaders.some(h => isProductSeriesHeader(h));
  if (!hasCanonicalHeaderProduct && !hasProductSeriesHeader) {
    mappedHeaders.push(canonicalHeaderProduct);
  }
  
  // "옵션" 헤더가 없고, 옵션 계열 MULTI-SLOT 헤더도 없는 경우에만 추가
  const hasCanonicalHeaderOption = mappedHeaders.some(h => h === canonicalHeaderOption);
  const hasOptionSeriesHeader = mappedHeaders.some(h => isOptionSeriesHeader(h));
  if (!hasCanonicalHeaderOption && !hasOptionSeriesHeader) {
    mappedHeaders.push(canonicalHeaderOption);
  }
  
  // "수량" 헤더가 없으면 추가
  const hasCanonicalHeaderQuantity = mappedHeaders.some(h => h === canonicalHeaderQuantity);
  if (!hasCanonicalHeaderQuantity) {
    mappedHeaders.push(canonicalHeaderQuantity);
  }
  
  // "배송요청사항" 헤더가 없으면 추가
  const hasCanonicalHeaderRequest = mappedHeaders.some(h => h === canonicalHeaderRequest);
  if (!hasCanonicalHeaderRequest) {
    mappedHeaders.push(canonicalHeaderRequest);
  }
  
  // "주문번호" 헤더가 없으면 추가
  const hasCanonicalHeaderOrderNumber = mappedHeaders.some(h => h === canonicalHeaderOrderNumber);
  if (!hasCanonicalHeaderOrderNumber) {
    mappedHeaders.push(canonicalHeaderOrderNumber);
  }
  
  return mappedHeaders;
}

/**
 * excel_header_candidates_v1을 읽어 헤더별 의미 후보 출현 횟수를 누적합니다.
 * localStorage의 excel_header_mapping_stats_v1을 생성·갱신합니다.
 */
function updateHeaderMappingStats() {
  try {
    const candidatesKey = 'excel_header_candidates_v1';
    const statsKey = 'excel_header_mapping_stats_v1';
    
    const candidatesData = localStorage.getItem(candidatesKey);
    if (!candidatesData) {
      return;
    }
    
    const candidates = JSON.parse(candidatesData);
    if (!candidates || typeof candidates !== 'object') {
      return;
    }
    
    // 기존 통계 데이터 읽기
    const existingStatsData = localStorage.getItem(statsKey);
    const stats: Record<string, Record<string, number>> = existingStatsData 
      ? JSON.parse(existingStatsData) 
      : {};
    
    // 의미 타입 정의
    const meaningTypes = ['name', 'phone', 'address', 'product', 'option', 'quantity', 'request', 'sender', 'sender_phone', 'sender_address'] as const;
    
    // 각 의미 타입별로 헤더 후보를 순회하며 통계 업데이트
    meaningTypes.forEach((meaningType) => {
      const headerList = candidates[meaningType];
      if (Array.isArray(headerList)) {
        headerList.forEach((header: string) => {
          const headerStr = String(header || '').trim();
          if (headerStr) {
            // 헤더별 통계 객체 초기화
            if (!stats[headerStr]) {
              stats[headerStr] = {};
            }
            // 해당 의미 타입의 출현 횟수 증가
            if (!stats[headerStr][meaningType]) {
              stats[headerStr][meaningType] = 0;
            }
            stats[headerStr][meaningType] += 1;
          }
        });
      }
    });
    
    // 통계를 localStorage에 저장
    localStorage.setItem(statsKey, JSON.stringify(stats));
  } catch (error) {
    // 통계 업데이트 실패해도 파싱은 계속 진행
    console.warn('헤더 매핑 통계 업데이트 실패:', error);
  }
}

/**
 * 헤더 문자열을 정규화하여 토큰 배열로 변환합니다.
 * - 특수문자 제거
 * - 괄호 분리 (괄호 및 괄호 내부 내용 제거)
 * - 숫자 제거
 * - 공백 기준 토큰화
 * - 소문자 변환 및 빈 토큰 제거
 * 
 * @param header - 정규화할 헤더 문자열
 * @returns 토큰 배열
 */
function normalizeHeader(header: string): string[] {
  let normalized = header;
  
  // 괄호 및 괄호 내부 내용 제거
  normalized = normalized.replace(/[\(\[【［（][^\(\)\[\]【】［］（）]*[\)\]】］）]/g, ' ');
  normalized = normalized.replace(/[\(\)\[\]\{\}【】［］（）]/g, ' ');
  
  // 특수문자 제거 (공백으로 대체)
  normalized = normalized.replace(/[^\w\s가-힣]/g, ' ');
  
  // 숫자 제거
  normalized = normalized.replace(/\d+/g, ' ');
  
  // 공백 기준 토큰화
  const tokens = normalized.split(/\s+/)
    .map(token => token.toLowerCase().trim())
    .filter(token => token.length > 0);
  
  return tokens;
}

/**
 * 키워드 기반으로 헤더의 의미 후보를 생성합니다.
 * localStorage의 excel_header_samples_v1를 읽어 excel_header_candidates_v1에 저장합니다.
 */
function generateHeaderCandidates() {
  try {
    const samplesKey = 'excel_header_samples_v1';
    const candidatesKey = 'excel_header_candidates_v1';
    
    const samplesData = localStorage.getItem(samplesKey);
    if (!samplesData) {
      return;
    }
    
    const samples = JSON.parse(samplesData);
    if (!Array.isArray(samples)) {
      return;
    }
    
    // 키워드 정의
    const nameKeywords = ['이름', '성함', '받는분', '받는 분', '수신자', '고객명', '고객', 'NAME', 'name', 'Name'];
    const phoneKeywords = ['연락처', '전화', '휴대폰', '핸드폰', 'TEL', 'tel', '전화번호', '연락', '연락처번호', 'PHONE', 'phone', 'Phone'];
    const addressKeywords = ['주소', '배송지', '도로명', '로', '길', '번지', '동', '구', '시', '군', '도', 'ADDRESS', 'address', 'Address', '배송주소'];
    const productKeywords = ['상품', '제품', '품목', '상품명', '제품명', 'PRODUCT', 'product', 'Product', 'ITEM', 'item', 'Item', '물품'];
    const optionKeywords = ['색상', '색', '크기', '사이즈', '옵션', '종류', '타입', '모델', '버전', '스펙', '사양', '규격', '형태', '디자인', '스타일', 'OPTION', 'option', 'Option'];
    const quantityKeywords = ['수량', '개', 'EA', '장', '세트', '개수', 'QUANTITY', 'quantity', 'Quantity', 'QTY', 'qty', 'Qty', '수'];
    const requestKeywords = ['부탁', '해주세요', '요청', '주문', '배송', '요구', 'REQUEST', 'request', 'Request', '메모', '비고', '특이사항', '요청사항'];
    
    // 모든 헤더를 수집
    const allHeaders: string[] = [];
    samples.forEach((sample: any) => {
      if (sample.headers && Array.isArray(sample.headers)) {
        sample.headers.forEach((header: any) => {
          const headerStr = String(header || '').trim();
          if (headerStr && !allHeaders.includes(headerStr)) {
            allHeaders.push(headerStr);
          }
        });
      }
    });
    
    // 각 헤더에 대해 의미 후보 매칭
    const candidates: Record<string, string[]> = {
      name: [],
      phone: [],
      address: [],
      product: [],
      option: [],
      quantity: [],
      request: [],
    };
    
    allHeaders.forEach((header) => {
      const headerTokens = normalizeHeader(header);
      
      // name 매칭
      if (nameKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.name.includes(header)) {
          candidates.name.push(header);
        }
      }
      
      // phone 매칭
      if (phoneKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.phone.includes(header)) {
          candidates.phone.push(header);
        }
      }
      
      // address 매칭
      if (addressKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.address.includes(header)) {
          candidates.address.push(header);
        }
      }
      
      // product 매칭
      if (productKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.product.includes(header)) {
          candidates.product.push(header);
        }
      }
      
      // option 매칭
      if (optionKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.option.includes(header)) {
          candidates.option.push(header);
        }
      }
      
      // quantity 매칭
      if (quantityKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.quantity.includes(header)) {
          candidates.quantity.push(header);
        }
      }
      
      // request 매칭
      if (requestKeywords.some(keyword => {
        const keywordTokens = normalizeHeader(keyword);
        return keywordTokens.some(kwToken => headerTokens.includes(kwToken));
      })) {
        if (!candidates.request.includes(header)) {
          candidates.request.push(header);
        }
      }
    });
    
    // 후보를 localStorage에 저장
    localStorage.setItem(candidatesKey, JSON.stringify(candidates));
    
    // 헤더 매핑 통계 업데이트
    updateHeaderMappingStats();
  } catch (error) {
    // 후보 생성 실패해도 파싱은 계속 진행
    console.warn('헤더 후보 생성 실패:', error);
  }
}

/**
 * 헤더를 정규화하고 사전 키워드와 직접 매칭합니다.
 * @param header - 매칭할 헤더 문자열
 * @returns 매칭된 필드 이름 또는 null
 */
function matchHeaderWithDictionary(header: string): string | null {
  const headerTokens = normalizeHeader(header);
  const meaningTypes = ['name', 'phone', 'address', 'product', 'option', 'quantity', 'request', 'sender', 'sender_phone', 'sender_address'] as const;
  
  // PRODUCT 매칭 추적용
  const productMatchLog: Array<{ keyword: string; keywordTokens: string[]; matched: boolean }> = [];
  
  // 각 의미 타입별로 사전 키워드와 매칭 시도
  for (const meaningType of meaningTypes) {
    const keywords = HEADER_DICTIONARY_V1[meaningType];
    if (!keywords) {
      continue;
    }
    
    // 사전의 각 키워드를 정규화하여 헤더 토큰과 비교
    for (const keyword of keywords) {
      const keywordTokens = normalizeHeader(keyword);
      // 키워드의 모든 토큰이 헤더 토큰에 포함되어 있는지 확인
      if (keywordTokens.length > 0 && keywordTokens.every(kwToken => headerTokens.includes(kwToken))) {
        // PRODUCT 매칭 시 상세 로그
        if (meaningType === 'product') {
          console.log('[PRODUCT_MATCH_DICTIONARY]', {
            header,
            headerTokens,
            matchedKeyword: keyword,
            keywordTokens,
            meaningType: 'product',
          });
        }
        return meaningType;
      }
      
      // PRODUCT 매칭 실패 시에도 로그 (상품명1, 상품상세1 추적용)
      if (meaningType === 'product') {
        const matched = keywordTokens.length > 0 && keywordTokens.every(kwToken => headerTokens.includes(kwToken));
        productMatchLog.push({ keyword, keywordTokens, matched });
      }
    }
  }
  
  // PRODUCT 매칭 실패 시 로그
  if (productMatchLog.length > 0) {
    const hasProductKeywords = productMatchLog.some(log => log.matched);
    if (!hasProductKeywords) {
      console.log('[PRODUCT_MATCH_DICTIONARY_FAILED]', {
        header,
        headerTokens,
        checkedKeywords: productMatchLog.slice(0, 10).map(log => ({
          keyword: log.keyword,
          keywordTokens: log.keywordTokens,
          matched: log.matched,
        })),
        totalChecked: productMatchLog.length,
      });
    }
  }
  
  return null;
}

/**
 * 최종 헤더 매핑이 확정된 후, 사전·통계에 없는 신규 헤더를 learned header map에 저장합니다.
 * 
 * @param headerToFieldMap - 최종 확정된 헤더 매핑 (header -> field)
 * @param headers - 원본 헤더 배열
 */
function saveLearnedHeaders(
  headerToFieldMap: Record<string, string>,
  headers: string[]
): void {
  try {
    const learnedMapKey = 'excel_header_learned_map_v1';
    const statsKey = 'excel_header_mapping_stats_v1';
    
    // 기존 learned map 읽기
    const existingLearnedData = localStorage.getItem(learnedMapKey);
    const learnedMap: Record<string, string> = existingLearnedData 
      ? JSON.parse(existingLearnedData) 
      : {};
    
    // 기존 통계 데이터 읽기 (통계에 있는지 확인용)
    const statsData = localStorage.getItem(statsKey);
    const stats: Record<string, Record<string, number>> = statsData 
      ? JSON.parse(statsData) 
      : {};
    
    // 신규 헤더 수집
    let newHeadersCount = 0;
    
    headers.forEach((header) => {
      const headerStr = String(header || '').trim();
      if (!headerStr) {
        return;
      }
      
      // 최종 매핑에 포함되어 있는지 확인
      const mappedField = headerToFieldMap[headerStr];
      if (!mappedField) {
        // 최종 매핑에 포함되지 않은 헤더는 건너뜀
        return;
      }
      
      // 사전 매칭이 실패했는지 확인
      const dictionaryMatch = matchHeaderWithDictionary(headerStr);
      if (dictionaryMatch) {
        // 사전에 매칭되는 헤더는 건너뜀
        return;
      }
      
      // 통계에도 없는지 확인
      const headerStats = stats[headerStr];
      if (headerStats && typeof headerStats === 'object') {
        // 통계에 있는 헤더는 건너뜀
        return;
      }
      
      // 사전과 통계에 없지만 최종 매핑이 확정된 신규 헤더를 learned map에 저장
      learnedMap[headerStr] = mappedField;
      newHeadersCount++;
    });
    
    // learned map을 localStorage에 저장
    if (newHeadersCount > 0) {
      localStorage.setItem(learnedMapKey, JSON.stringify(learnedMap));
      console.log(`신규 헤더 ${newHeadersCount}개를 learned header map에 저장했습니다.`);
    }
  } catch (error) {
    // learned map 저장 실패해도 파싱은 계속 진행
    console.warn('learned header map 저장 실패:', error);
  }
}

/**
 * 헤더 매핑을 생성합니다. 우선순위:
 * (1) 정규화+사전키워드 직접매칭
 * (2) excel_header_mapping_stats_v1 통계
 * (3) 실패 시 null
 * 
 * 참고: 인접 셀 탐색은 더 이상 사용되지 않습니다 (규칙 변경).
 * 
 * @param headers - 매핑할 헤더 배열
 * @returns 헤더 이름을 필드 이름으로 매핑하는 객체 (header -> field)
 */
function generateHeaderToFieldMap(headers: string[]): Record<string, string> {
  const headerToFieldMap: Record<string, string> = {};
  const meaningTypes = ['name', 'phone', 'address', 'product', 'option', 'quantity', 'request', 'sender', 'sender_phone', 'sender_address'] as const;
  
  // 중립 헤더인지 확인하는 함수 (phone, contact, address, name)
  const isNeutralHeader = (headerName: string): boolean => {
    const normalized = headerName.toLowerCase().trim();
    const headerTokens = normalizeHeader(headerName);
    
    // phone 관련 키워드
    const phoneKeywords = ['phone', 'tel', '연락처', '전화', 'contact', '휴대폰', '핸드폰'];
    // address 관련 키워드
    const addressKeywords = ['address', '주소', '배송지'];
    // name 관련 키워드
    const nameKeywords = ['name', '이름', '성함'];
    // contact는 phone과 동일하게 처리
    
    // 토큰 기반 매칭
    const hasPhoneToken = phoneKeywords.some(kw => {
      const kwTokens = normalizeHeader(kw);
      return kwTokens.some(kwToken => headerTokens.includes(kwToken));
    });
    const hasAddressToken = addressKeywords.some(kw => {
      const kwTokens = normalizeHeader(kw);
      return kwTokens.some(kwToken => headerTokens.includes(kwToken));
    });
    const hasNameToken = nameKeywords.some(kw => {
      const kwTokens = normalizeHeader(kw);
      return kwTokens.some(kwToken => headerTokens.includes(kwToken));
    });
    
    // 문자열 직접 포함 여부도 확인 (토큰화에서 누락될 수 있음)
    const hasPhoneStr = phoneKeywords.some(kw => normalized.includes(kw));
    const hasAddressStr = addressKeywords.some(kw => normalized.includes(kw));
    const hasNameStr = nameKeywords.some(kw => normalized.includes(kw));
    
    return hasPhoneToken || hasPhoneStr || hasAddressToken || hasAddressStr || hasNameToken || hasNameStr;
  };
  
  // 보내는사람 관련 헤더인지 확인하는 함수 (sender_phone, sender_address 제외)
  const isSenderColumn = (headerName: string): boolean => {
    const normalized = headerName.toLowerCase().trim();
    // sender_phone, sender_address는 제외하고, sender 이름 관련 헤더만 무시
    const senderKeywords = ['보내는사람', '보내는분', '발송인', '출고지', 'sender', '보내는', '발송', '출고'];
    // sender_phone 관련 키워드는 제외
    if (normalized.includes('phone') || normalized.includes('tel') || normalized.includes('연락처') || normalized.includes('전화')) {
      return false;
    }
    // sender_address 관련 키워드는 제외
    if (normalized.includes('address') || normalized.includes('주소')) {
      return false;
    }
    return senderKeywords.some(keyword => normalized.includes(keyword));
  };
  
  try {
    // (1) 정규화+사전키워드 직접매칭
    headers.forEach((header) => {
      const headerStr = String(header || '').trim();
      if (!headerStr) {
        return;
      }
      
      // 보내는사람 관련 헤더는 무시 (단, sender_phone은 제외)
      if (isSenderColumn(headerStr)) {
        return;
      }
      
      // 옵션 계열 헤더는 MULTI-SLOT으로 분류하여 개별 필드로 매핑
      if (isOptionSeriesHeader(headerStr)) {
        headerToFieldMap[headerStr] = convertOptionHeaderToField(headerStr);
        return;
      }
      
      // 상품 계열 헤더는 MULTI-SLOT으로 분류하여 개별 필드로 매핑
      if (isProductSeriesHeader(headerStr)) {
        const fieldName = convertProductHeaderToField(headerStr);
        headerToFieldMap[headerStr] = fieldName;
        console.log('[PRODUCT_SERIES_MAPPED]', {
          header: headerStr,
          fieldName,
          method: 'isProductSeriesHeader',
        });
        
        // 상품명1/상품상세1 추적용 로그
        if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
          console.log('[TRACE_HEADER_MAPPING]', {
            step: '헤더 매핑 생성 (isProductSeriesHeader)',
            header: headerStr,
            isProductSeries: true,
            fieldName,
            'headerToFieldMap[header]': headerToFieldMap[headerStr],
          });
        }
        return;
      }
      
        const dictionaryMatch = matchHeaderWithDictionary(headerStr);
        if (dictionaryMatch) {
          // 중립 헤더가 sender 계열로 매핑되는 것을 차단
          if (isNeutralHeader(headerStr) && (dictionaryMatch === 'sender' || dictionaryMatch === 'sender_phone' || dictionaryMatch === 'sender_address')) {
            // 매핑 무시 (skip)
            console.log('[PRODUCT_MAPPING_BLOCKED]', {
              header: headerStr,
              reason: 'isNeutralHeader && sender_*',
              dictionaryMatch,
            });
            return;
          }
          // 상품 계열은 MULTI-SLOT으로 처리하므로 사전 매칭에서 'product'로 매핑되는 것을 무시
          if (dictionaryMatch === 'product' && isProductSeriesHeader(headerStr)) {
            // 이미 위에서 MULTI-SLOT으로 처리되었으므로 여기서는 무시
            console.log('[PRODUCT_MAPPING_SKIPPED]', {
              header: headerStr,
              reason: 'already handled by isProductSeriesHeader',
              dictionaryMatch,
            });
            
            // 상품명1/상품상세1 추적용 로그
            if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
              console.log('[TRACE_HEADER_MAPPING]', {
                step: '헤더 매핑 생성 (dictionary match skipped)',
                header: headerStr,
                dictionaryMatch: 'product',
                isProductSeries: true,
                reason: 'already handled by isProductSeriesHeader',
                'headerToFieldMap[header]': headerToFieldMap[headerStr] || null,
              });
            }
            return;
          }
          headerToFieldMap[headerStr] = dictionaryMatch;
          
          // PRODUCT 매칭 성공 로그
          if (dictionaryMatch === 'product') {
            console.log('[PRODUCT_MAPPED_DICTIONARY]', {
              header: headerStr,
              fieldName: dictionaryMatch,
              method: 'matchHeaderWithDictionary',
            });
          }
          
          // 상품명1/상품상세1 추적용 로그
          if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
            console.log('[TRACE_HEADER_MAPPING]', {
              step: '헤더 매핑 생성 (dictionary match)',
              header: headerStr,
              dictionaryMatch,
              isProductSeries: isProductSeriesHeader(headerStr),
              'headerToFieldMap[header]': headerToFieldMap[headerStr],
            });
          }
        } else {
          // 매칭 실패 시 로그 (상품명1, 상품상세1 추적용)
          if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
            console.log('[PRODUCT_MAPPING_FAILED]', {
              header: headerStr,
              isProductSeriesHeader: isProductSeriesHeader(headerStr),
              dictionaryMatch: null,
            });
            
            console.log('[TRACE_HEADER_MAPPING]', {
              step: '헤더 매핑 생성 (dictionary match failed)',
              header: headerStr,
              dictionaryMatch: null,
              isProductSeries: isProductSeriesHeader(headerStr),
              'headerToFieldMap[header]': headerToFieldMap[headerStr] || null,
            });
          }
        }
    });
    
    // (2) excel_header_mapping_stats_v1 통계 (사전 매칭에 실패한 헤더만)
    const statsKey = 'excel_header_mapping_stats_v1';
    const statsData = localStorage.getItem(statsKey);
    
    if (statsData) {
      try {
        const stats: Record<string, Record<string, number>> = JSON.parse(statsData);
        if (stats && typeof stats === 'object') {
          headers.forEach((header) => {
            const headerStr = String(header || '').trim();
            if (!headerStr || headerToFieldMap[headerStr]) {
              // 이미 사전 매칭으로 매핑된 헤더는 건너뜀
              return;
            }
            
            // 보내는사람 관련 헤더는 무시
            if (isSenderColumn(headerStr)) {
              return;
            }
            
            // 옵션 계열 헤더는 MULTI-SLOT으로 분류하여 개별 필드로 매핑
            // (통계에서 'option'으로 합쳐지더라도 무시하고 개별 필드로 유지)
            if (isOptionSeriesHeader(headerStr)) {
              headerToFieldMap[headerStr] = convertOptionHeaderToField(headerStr);
              return;
            }
            
            // 상품 계열 헤더는 MULTI-SLOT으로 분류하여 개별 필드로 매핑
            // (통계에서 'product'로 합쳐지더라도 무시하고 개별 필드로 유지)
            if (isProductSeriesHeader(headerStr)) {
              const fieldName = convertProductHeaderToField(headerStr);
              headerToFieldMap[headerStr] = fieldName;
              console.log('[PRODUCT_SERIES_MAPPED_STATS]', {
                header: headerStr,
                fieldName,
                method: 'isProductSeriesHeader (stats fallback)',
              });
              
              // 상품명1/상품상세1 추적용 로그
              if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
                console.log('[TRACE_HEADER_MAPPING]', {
                  step: '헤더 매핑 생성 (stats fallback - isProductSeriesHeader)',
                  header: headerStr,
                  isProductSeries: true,
                  fieldName,
                  'headerToFieldMap[header]': headerToFieldMap[headerStr],
                });
              }
              return;
            }
            
            const headerStats = stats[headerStr];
            if (!headerStats || typeof headerStats !== 'object') {
              return;
            }
            
            let maxCount = 0;
            let mostFrequentField: string | null = null;
            
            // 각 의미 타입별 출현 횟수를 확인하여 최대값 찾기
            meaningTypes.forEach((field) => {
              const count = headerStats[field] || 0;
              if (count > maxCount) {
                maxCount = count;
                mostFrequentField = field;
              }
            });
            
            // 가장 많이 등장한 의미가 있으면 매핑에 추가
            if (mostFrequentField && maxCount > 0) {
              // 중립 헤더가 sender 계열로 매핑되는 것을 차단
              if (isNeutralHeader(headerStr) && (mostFrequentField === 'sender' || mostFrequentField === 'sender_phone' || mostFrequentField === 'sender_address')) {
                // 매핑 무시 (skip)
                console.log('[PRODUCT_MAPPING_BLOCKED_STATS]', {
                  header: headerStr,
                  reason: 'isNeutralHeader && sender_*',
                  mostFrequentField,
                  maxCount,
                });
                return;
              }
              // 상품 계열은 MULTI-SLOT으로 처리하므로 통계에서 'product'로 매핑되는 것을 무시
              if (mostFrequentField === 'product' && isProductSeriesHeader(headerStr)) {
                // 이미 위에서 MULTI-SLOT으로 처리되었으므로 여기서는 무시
                console.log('[PRODUCT_MAPPING_SKIPPED_STATS]', {
                  header: headerStr,
                  reason: 'already handled by isProductSeriesHeader',
                  mostFrequentField,
                  maxCount,
                });
                
                // 상품명1/상품상세1 추적용 로그
                if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
                  console.log('[TRACE_HEADER_MAPPING]', {
                    step: '헤더 매핑 생성 (stats match skipped)',
                    header: headerStr,
                    mostFrequentField: 'product',
                    isProductSeries: true,
                    reason: 'already handled by isProductSeriesHeader',
                    'headerToFieldMap[header]': headerToFieldMap[headerStr] || null,
                  });
                }
                return;
              }
              headerToFieldMap[headerStr] = mostFrequentField;
              
              // PRODUCT 매칭 성공 로그 (통계 기반)
              if (mostFrequentField === 'product') {
                console.log('[PRODUCT_MAPPED_STATS]', {
                  header: headerStr,
                  fieldName: mostFrequentField,
                  maxCount,
                  method: 'excel_header_mapping_stats_v1',
                });
              }
              
              // 상품명1/상품상세1 추적용 로그
              if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
                console.log('[TRACE_HEADER_MAPPING]', {
                  step: '헤더 매핑 생성 (stats match)',
                  header: headerStr,
                  mostFrequentField,
                  maxCount,
                  isProductSeries: isProductSeriesHeader(headerStr),
                  'headerToFieldMap[header]': headerToFieldMap[headerStr],
                });
              }
            } else {
              // 통계에서도 매핑 실패 시 로그 (UNKNOWN 처리 지점)
              if (headerStr.includes('상품명1') || headerStr.includes('상품상세1')) {
                console.log('[PRODUCT_MAPPING_FAILED_STATS]', {
                  header: headerStr,
                  isProductSeriesHeader: isProductSeriesHeader(headerStr),
                  headerStats,
                  mostFrequentField: null,
                  maxCount: 0,
                  status: 'UNKNOWN - will remain as original header',
                });
                
                console.log('[TRACE_HEADER_MAPPING]', {
                  step: '헤더 매핑 생성 (stats match failed)',
                  header: headerStr,
                  isProductSeries: isProductSeriesHeader(headerStr),
                  headerStats,
                  mostFrequentField: null,
                  maxCount: 0,
                  status: 'UNKNOWN - will remain as original header',
                  'headerToFieldMap[header]': headerToFieldMap[headerStr] || null,
                });
              }
            }
          });
        }
      } catch (error) {
        // 통계 파싱 실패는 무시
        console.warn('헤더 매핑 통계 파싱 실패:', error);
      }
    }
    
    // (3) 실패 시 null은 매핑되지 않은 헤더는 원본 그대로 유지됨
    // 참고: 인접 셀 탐색은 더 이상 사용되지 않습니다 (규칙 변경)
    
    // 최종 매핑 결과 요약 로그 (PRODUCT 관련)
    const productHeaders = headers.filter(h => {
      const headerStr = String(h || '').trim();
      return headerStr.includes('상품') || headerStr.toLowerCase().includes('product');
    });
    
    if (productHeaders.length > 0) {
      console.log('[PRODUCT_HEADERS_SUMMARY]', {
        totalProductHeaders: productHeaders.length,
        productHeaders: productHeaders.map(header => {
          const headerStr = String(header || '').trim();
          return {
            header: headerStr,
            isProductSeries: isProductSeriesHeader(headerStr),
            dictionaryMatch: matchHeaderWithDictionary(headerStr),
            finalMapping: headerToFieldMap[headerStr] || 'UNKNOWN (original header kept)',
          };
        }),
      });
    }
    
    return headerToFieldMap;
  } catch (error) {
    // 매핑 생성 실패해도 파싱은 계속 진행
    console.warn('헤더 매핑 생성 실패:', error);
    return {};
  }
}

/**
 * 헤더 이름을 컬럼 인덱스로 매핑하는 테이블을 생성합니다.
 * 중복 헤더나 빈 헤더("__EMPTY")를 고려하여 모든 헤더를 고유하게 매핑합니다.
 * 
 * @param headerRow - 헤더 행 배열
 * @returns 헤더 이름 -> 컬럼 인덱스 배열의 맵 (같은 헤더가 여러 번 나올 수 있음)
 */
function createHeaderToColumnIndexMap(headerRow: any[]): Record<string, number[]> {
  const headerToIndices: Record<string, number[]> = {};
  
  headerRow.forEach((header, colIndex) => {
    const headerStr = String(header || '').trim();
    // 빈 헤더나 "__EMPTY"는 고유 키로 처리
    const key = headerStr || `__EMPTY_${colIndex}`;
    
    if (!headerToIndices[key]) {
      headerToIndices[key] = [];
    }
    headerToIndices[key].push(colIndex);
  });
  
  return headerToIndices;
}

/**
 * [사용 중단] 빈 셀일 경우 같은 컬럼 기준으로 위쪽 1칸, 그 다음 아래 1칸까지 값을 탐색하여 첫 번째 유효 값을 반환합니다.
 * 
 * 규칙 변경에 따라 이 함수는 더 이상 사용되지 않습니다:
 * - 값 없음인 경우 findValueFromAdjacentCells 절대 호출하지 않음
 * - 기본 컬럼(이름/전화/주소/상품/수량)에서는 완전 금지
 * - 값 결정 흐름: 셀에 값 있으면 사용, 없으면 null
 * 
 * @deprecated 이 함수는 더 이상 사용되지 않습니다. applyHeaderMapping에서 호출하지 않습니다.
 * @param worksheetData - 원본 워크시트 데이터 (2차원 배열, 헤더 포함)
 * @param rowIndex - 현재 행 인덱스 (0-based, 헤더 포함 기준)
 * @param colIndex - 현재 열 인덱스 (0-based)
 * @returns 첫 번째 유효 값 또는 null
 */
function findValueFromAdjacentCells(
  worksheetData: any[][],
  rowIndex: number,
  colIndex: number
): any {
  const currentValue = worksheetData[rowIndex]?.[colIndex];
  
  // 현재 값이 유효하면 그대로 반환
  if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
    return currentValue;
  }
  
  // 같은 컬럼 기준으로 위쪽 1칸 탐색 (헤더 행 제외)
  const aboveRowIndex = rowIndex - 1;
  if (aboveRowIndex > 0) { // 헤더 행(0)보다 큰 경우에만
    const aboveValue = worksheetData[aboveRowIndex]?.[colIndex];
    if (aboveValue !== undefined && aboveValue !== null && aboveValue !== '') {
      return aboveValue;
    }
  }
  
  // 같은 컬럼 기준으로 아래 1칸 탐색
  const belowRowIndex = rowIndex + 1;
  if (belowRowIndex < worksheetData.length) {
    const belowValue = worksheetData[belowRowIndex]?.[colIndex];
    if (belowValue !== undefined && belowValue !== null && belowValue !== '') {
      return belowValue;
    }
  }
  
  return null;
}

/**
 * 값이 없는지 확인하는 헬퍼 함수
 * undefined, null, ""인 경우 true 반환
 */
function isEmptyValue(value: any): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * 헤더 매핑을 적용하여 rows를 변환합니다.
 * 매핑된 필드는 표준 필드명으로 변환하고, 매핑되지 않은 헤더는 원본 그대로 유지합니다.
 * 여러 헤더가 같은 필드로 매핑되는 경우, 빈 값이 먼저 들어간 경우 뒤에 유효 값이 있으면 덮어쓰기 허용합니다.
 * 
 * 규칙:
 * 1. name, phone, address 필드: dataRow[colIndex] 값이 존재하면 isEmptyValue 검사로 null 처리하지 말고 그대로 보존
 * 2. product, quantity 필드: 기존 null 처리 규칙 유지 (isEmptyValue면 null)
 * 3. 인접 셀 탐색은 어떤 필드에서도 사용하지 않음 (findValueFromAdjacentCells 호출하지 않음)
 * 
 * @param rows - 원본 행 데이터 (헤더 제외)
 * @param headerToFieldMap - 헤더 이름을 필드 이름으로 매핑하는 객체
 * @param worksheetData - 원본 워크시트 데이터 (2차원 배열, 헤더 포함) - 사용하지 않음 (인접 셀 탐색 미사용)
 * @param headerRow - 헤더 행 배열
 * @returns 변환된 행 데이터
 */
function applyHeaderMapping(
  rows: Record<string, any>[],
  headerToFieldMap: Record<string, string>,
  worksheetData: any[][],
  headerRow: any[]
): Record<string, any>[] {
  if (!headerToFieldMap || Object.keys(headerToFieldMap).length === 0) {
    // 매핑이 없으면 원본 그대로 반환
    return rows;
  }
  
  try {
    return rows.map((row, dataRowIndex) => {
      const mappedRow: Record<string, any> = {};
      
      // 헤더를 순회하며 매핑 적용
      headerRow.forEach((originalHeader, colIndex) => {
        const headerStr = String(originalHeader || '').trim();
        const fieldName = headerToFieldMap[headerStr];
        
        if (fieldName) {
          // dataRow[colIndex] 값 가져오기
          const value = row[headerStr];
          
          // name 필드: 최초 유효값 1회 확정 필드로 취급
          if (fieldName === 'name') {
            // mappedRow.name에 이미 값이 있으면 이후 어떤 헤더에서도 null/빈 값으로 덮어쓰지 않음
            if (mappedRow.name) {
              return; // 즉시 return (forEach 루프에서 continue)
            }
            // mappedRow.name에 값이 없는 경우에만 처리
            if (!isEmptyValue(value)) {
              // 유효한 값이면 설정 (최초 1회만)
              mappedRow[fieldName] = value;
            } else {
              // 값이 비어있으면 null 설정 (최초에만)
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
            }
            return; // name 필드 처리 완료
          }
          
          // 필드 타입별 분기 처리
          const preserveFields = ['phone', 'address'];
          const nullCheckFields = ['quantity'];
          
          // 옵션 계열 필드인지 확인 (option, option1, option2, additional_option 등)
          const isOptionField = fieldName.startsWith('option') || 
                                fieldName === 'additional_option' || 
                                fieldName === 'selected_option' ||
                                fieldName.startsWith('productoption');
          
          if (preserveFields.includes(fieldName)) {
            // phone, address 필드: 이미 값이 있으면 null로 덮어쓰지 않음
            if (!isEmptyValue(value)) {
              // 값이 존재하면 그대로 보존 (덮어쓰기 허용)
              mappedRow[fieldName] = value;
            } else {
              // 값이 비어있어도, 이미 값이 있으면 null로 덮어쓰지 않음
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
              // 이미 mappedRow[fieldName]에 값이 있으면 그대로 유지 (null로 덮어쓰기 금지)
            }
          } else if (nullCheckFields.includes(fieldName)) {
            // quantity 필드: 기존 null 처리 규칙 유지
            if (isEmptyValue(value)) {
              // 값 없으면 null
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
            } else {
              // 셀에 값 있으면 사용
              // 여러 헤더가 같은 필드로 매핑되는 경우, 뒤에 유효 값이 있으면 덮어쓰기 허용
              if (mappedRow[fieldName] === undefined || mappedRow[fieldName] === null || mappedRow[fieldName] === '') {
                mappedRow[fieldName] = value;
              }
            }
          } else if (fieldName === 'product') {
            // 단일 'product' 필드: 값이 있으면 mappedRow.product에만 설정
            if (!isEmptyValue(value)) {
              const cellValue = String(value).trim();
              if (cellValue !== '') {
                // 값이 있으면 product 필드에 설정 (덮어쓰기 허용)
                mappedRow[fieldName] = cellValue;
              }
            } else {
              // 값이 없으면 null 설정 (첫 설정 시에만)
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
            }
          } else if (isOptionField) {
            // 옵션 계열 MULTI-SLOT 필드: 각 필드는 독립적으로 보존, 덮어쓰기 금지
            // 각 헤더(옵션, 옵션1, 옵션2 등)는 이미 별도 필드로 매핑되었으므로
            // 같은 필드명으로의 덮어쓰기는 발생하지 않음
            // 단, 같은 헤더가 중복으로 나올 경우에만 보호 필요
            if (!isEmptyValue(value)) {
              // 값이 있으면 설정 (첫 설정 시에만, 이미 값이 있으면 덮어쓰기 금지)
              if (mappedRow[fieldName] === undefined || mappedRow[fieldName] === null || mappedRow[fieldName] === '') {
                mappedRow[fieldName] = value;
              }
            } else {
              // 값이 비어있으면 null 설정 (첫 설정 시에만)
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
            }
          } else {
            // 기타 필드 (request 등): 기본 동작
            if (isEmptyValue(value)) {
              if (mappedRow[fieldName] === undefined) {
                mappedRow[fieldName] = null;
              }
            } else {
              if (mappedRow[fieldName] === undefined || mappedRow[fieldName] === null || mappedRow[fieldName] === '') {
                mappedRow[fieldName] = value;
              }
            }
          }
        } else {
          // 매핑이 없는 경우 원본 헤더 유지 (UNKNOWN 처리)
          if (headerStr && row[headerStr] !== undefined) {
            mappedRow[headerStr] = row[headerStr];
          }
        }
      });
      
      // 검증 로그: 주소/상품/수량이 비어 있으면 그대로 빈 값으로 유지되는지 확인
      if (dataRowIndex < 3) { // 처음 3개 행만 로그 출력
        const addressValue = mappedRow['address'];
        const productValue = mappedRow['product'];
        const quantityValue = mappedRow['quantity'];
        
        console.log(`[applyHeaderMapping 검증] 행 ${dataRowIndex + 1}:`, {
          address: addressValue,
          addressIsEmpty: isEmptyValue(addressValue),
          product: productValue,
          productIsEmpty: isEmptyValue(productValue),
          quantity: quantityValue,
          quantityIsEmpty: isEmptyValue(quantityValue),
        });
      }
      
      return mappedRow;
    });
  } catch (error) {
    // 매핑 적용 실패 시 원본 반환 (기존 파싱 흐름 유지)
    console.warn('헤더 매핑 적용 실패, 원본 데이터 반환:', error);
    return rows;
  }
}

/**
 * xlsx 파일을 읽어 첫 번째 시트를 객체 배열로 반환합니다.
 * 각 행은 객체로 변환되며, 첫 번째 행의 값이 키로 사용됩니다.
 * excel_header_mapping_stats_v1을 기반으로 헤더 매핑을 적용합니다.
 * 
 * @param file - 읽을 xlsx 파일 (File 객체)
 * @returns 첫 번째 시트의 행들을 객체 배열로 반환 (헤더 매핑 적용됨)
 * @throws 파일을 읽을 수 없거나 시트가 없는 경우 에러 발생
 */
export async function parseExcel(file: File): Promise<Record<string, any>[]> {
  console.log('=== parseExcel 함수 시작 ===');
  console.log('입력 파일명:', file.name);
  console.log('입력 파일 크기:', file.size, 'bytes');
  
  // File을 ArrayBuffer로 읽기
  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer 읽기 완료, 크기:', arrayBuffer.byteLength, 'bytes');
  
  // 워크북 읽기
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  console.log('워크북 읽기 완료, 시트 개수:', workbook.SheetNames.length);
  console.log('시트 이름들:', workbook.SheetNames);
  
  // 첫 번째 시트 이름 가져오기
  const firstSheetName = workbook.SheetNames[0];
  
  if (!firstSheetName) {
    throw new Error('엑셀 파일에 시트가 없습니다.');
  }
  
  console.log('처리할 첫 번째 시트:', firstSheetName);
  
  // 첫 번째 시트 가져오기
  const worksheet = workbook.Sheets[firstSheetName];
  
  // 첫 번째 행(헤더) 추출
  const headerRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as any[][];
  let headerRow = headerRows[0] || [];
  
  // 헤더 alias 매핑 적용 (받는분전화로 매핑)
  headerRow = applyHeaderAliasMapping(headerRow);
  
  console.log('=== 헤더 행 추출 ===');
  console.log('헤더 행:', headerRow);
  console.log('헤더 개수:', headerRow.length);
  console.log('헤더 상세:', JSON.stringify(headerRow, null, 2));
  
  // 실제 읽히는 raw headers와 HEADER_DICTIONARY 비교 분석
  console.log('\n=== HEADER_DICTIONARY 비교 분석 ===');
  console.log('HEADER_DICTIONARY 키들:', Object.keys(HEADER_DICTIONARY_V1));
  console.log('\n--- Raw Headers vs HEADER_DICTIONARY 매칭 결과 ---');
  
  const meaningTypes = ['name', 'phone', 'address', 'product', 'option', 'quantity', 'request', 'sender', 'sender_phone', 'sender_address'] as const;
  const comparisonReport: Array<{
    rawHeader: string;
    matchedTypes: string[];
    matchedKeywords: Record<string, string[]>;
  }> = [];
  
  headerRow.forEach((rawHeader, index) => {
    const headerStr = String(rawHeader || '').trim();
    if (!headerStr) {
      console.log(`[${index}] 빈 헤더`);
      return;
    }
    
    const matchedTypes: string[] = [];
    const matchedKeywords: Record<string, string[]> = {};
    
    // 각 의미 타입별로 매칭 시도
    meaningTypes.forEach((meaningType) => {
      const keywords = HEADER_DICTIONARY_V1[meaningType];
      if (!keywords) return;
      
      const headerTokens = normalizeHeader(headerStr);
      const matchedKws: string[] = [];
      
      // 사전의 각 키워드를 정규화하여 헤더 토큰과 비교
      keywords.forEach((keyword) => {
        const keywordTokens = normalizeHeader(keyword);
        // 키워드의 모든 토큰이 헤더 토큰에 포함되어 있는지 확인
        if (keywordTokens.length > 0 && keywordTokens.every(kwToken => headerTokens.includes(kwToken))) {
          matchedKws.push(keyword);
        }
      });
      
      if (matchedKws.length > 0) {
        matchedTypes.push(meaningType);
        matchedKeywords[meaningType] = matchedKws;
      }
    });
    
    comparisonReport.push({
      rawHeader: headerStr,
      matchedTypes,
      matchedKeywords,
    });
    
    // 콘솔 출력
    console.log(`\n[${index}] "${headerStr}"`);
    if (matchedTypes.length > 0) {
      console.log(`  ✓ 매칭된 타입: ${matchedTypes.join(', ')}`);
      matchedTypes.forEach((type) => {
        console.log(`    - ${type}: ${matchedKeywords[type].slice(0, 5).join(', ')}${matchedKeywords[type].length > 5 ? ` ... (총 ${matchedKeywords[type].length}개)` : ''}`);
      });
    } else {
      console.log(`  ✗ 매칭된 타입 없음 (HEADER_DICTIONARY에 해당하는 키워드 없음)`);
    }
  });
  
  // 요약 통계
  console.log('\n--- 매칭 요약 통계 ---');
  const matchedCount = comparisonReport.filter(r => r.matchedTypes.length > 0).length;
  const unmatchedCount = comparisonReport.filter(r => r.matchedTypes.length === 0).length;
  console.log(`전체 헤더 개수: ${headerRow.length}`);
  console.log(`매칭된 헤더: ${matchedCount}개`);
  console.log(`매칭되지 않은 헤더: ${unmatchedCount}개`);
  
  const typeStats: Record<string, number> = {};
  comparisonReport.forEach((report) => {
    report.matchedTypes.forEach((type) => {
      typeStats[type] = (typeStats[type] || 0) + 1;
    });
  });
  console.log('\n타입별 매칭 횟수:');
  meaningTypes.forEach((type) => {
    console.log(`  ${type}: ${typeStats[type] || 0}개`);
  });
  
  if (unmatchedCount > 0) {
    console.log('\n--- 매칭되지 않은 헤더 목록 ---');
    comparisonReport
      .filter(r => r.matchedTypes.length === 0)
      .forEach((report, idx) => {
        console.log(`  ${idx + 1}. "${report.rawHeader}"`);
      });
  }
  
  console.log('\n=== HEADER_DICTIONARY 비교 분석 완료 ===\n');
  
  // 원본 워크시트 데이터를 2차원 배열로 유지 (빈 셀 탐색용)
  const worksheetData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as any[][];
  
  console.log('=== 워크시트 데이터 구조 ===');
  console.log('총 행 개수 (헤더 포함):', worksheetData.length);
  console.log('데이터 행 개수 (헤더 제외):', worksheetData.length - 1);
  if (worksheetData.length > 0) {
    console.log('첫 번째 행 (헤더):', worksheetData[0]);
    if (worksheetData.length > 1) {
      console.log('두 번째 행 (첫 번째 데이터 행):', worksheetData[1]);
    }
  }
  
  // 헤더와 파일명을 localStorage에 누적 저장
  if (headerRow && headerRow.length > 0) {
    try {
      const storageKey = 'excel_header_samples_v1';
      const existingData = localStorage.getItem(storageKey);
      const samples = existingData ? JSON.parse(existingData) : [];
      
      // 새로운 샘플 추가
      samples.push({
        filename: file.name,
        headers: headerRow,
        timestamp: new Date().toISOString(),
      });
      
      localStorage.setItem(storageKey, JSON.stringify(samples));
      
      // 키워드 기반 의미 후보 생성
      generateHeaderCandidates();
      console.log('헤더 샘플 저장 및 후보 생성 완료');
    } catch (error) {
      // localStorage 저장 실패 시에도 파싱은 계속 진행
      console.warn('헤더 샘플 저장 실패:', error);
    }
  }
  
  // 시트를 JSON 배열로 변환 (첫 번째 행을 헤더로 사용)
  // 주의: headerRow에 alias 매핑이 이미 적용되어 있으므로, 
  // rows 데이터도 alias 매핑된 헤더 이름을 키로 사용하도록 변환 필요
  const originalRows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '', // 빈 셀의 기본값
    raw: false, // 날짜를 문자열로 변환
  }) as Record<string, any>[];
  
  // alias 매핑 적용 전 원본 헤더 (rows의 키는 원본 헤더 이름 사용)
  const originalHeaderRow = headerRows[0] || [];
  
  // rows 데이터에 alias 매핑 적용: 원본 헤더를 canonical header로 변환
  const rows = originalRows.map((row) => {
    const mappedRow: Record<string, any> = { ...row };
    
    // 받는분전화 alias 헤더 목록
    const aliasHeadersPhone = [
      '도착인전화',
      '수하인전화',
      'customer_phone',
      'to_tel',
      'recipient_phone',
      'consignee_phone',
      'consignee_tel',
      'receiver_phone',
      'receiver_tel',
      '수령지전화',
      '배송지연락처',
      '배송지전화',
      '회원전화',
      '구매자연락처',
      '주문자전화',
      '고객휴대폰',
      '고객연락처',
      '고객전화',
      '수령자전화',
      '수신인전화',
      '수취인전화',
      '수령인전화',
      '받는분전화',
      '받는사람전화',
    ];
    
    const canonicalHeaderPhone = '받는분전화';
    let canonicalValuePhone: any = null;
    
    // 받는분전화 alias 헤더들의 값을 canonical header로 통합
    aliasHeadersPhone.forEach((aliasHeader) => {
      if (mappedRow[aliasHeader] !== undefined && mappedRow[aliasHeader] !== null && mappedRow[aliasHeader] !== '') {
        const value = mappedRow[aliasHeader];
        // 첫 번째 유효한 값 사용
        if (canonicalValuePhone === null || canonicalValuePhone === '') {
          canonicalValuePhone = value;
        }
        // alias 헤더는 삭제
        delete mappedRow[aliasHeader];
      }
    });
    
    // 받는분전화 canonical header 설정 (값이 있거나 없으면 null)
    if (canonicalValuePhone !== null) {
      mappedRow[canonicalHeaderPhone] = canonicalValuePhone;
    } else if (mappedRow[canonicalHeaderPhone] === undefined) {
      mappedRow[canonicalHeaderPhone] = null;
    }
    
    // 받는분주소 alias 헤더 목록
    const aliasHeadersAddress = [
      'to_address',
      'recipient_address',
      'consignee_address',
      'receiver_address',
      '배송지주소',
      '수령지주소',
      '받는주소',
      '수령주소',
      '배송주소',
      '배송지',
    ];
    
    const canonicalHeaderAddress = '받는분주소';
    let canonicalValueAddress: any = null;
    
    // 받는분주소 alias 헤더들의 값을 canonical header로 통합
    aliasHeadersAddress.forEach((aliasHeader) => {
      if (mappedRow[aliasHeader] !== undefined && mappedRow[aliasHeader] !== null && mappedRow[aliasHeader] !== '') {
        const value = mappedRow[aliasHeader];
        // 첫 번째 유효한 값 사용
        if (canonicalValueAddress === null || canonicalValueAddress === '') {
          canonicalValueAddress = value;
        }
        // alias 헤더는 삭제
        delete mappedRow[aliasHeader];
      }
    });
    
    // 받는분주소 canonical header 설정 (값이 있거나 없으면 null)
    if (canonicalValueAddress !== null) {
      mappedRow[canonicalHeaderAddress] = canonicalValueAddress;
    } else if (mappedRow[canonicalHeaderAddress] === undefined) {
      mappedRow[canonicalHeaderAddress] = null;
    }
    
    // 상품 계열 헤더는 MULTI-SLOT 필드로 분류하여 통합하지 않음
    // 각각 개별 필드로 유지 (상품 → product, 상품1 → product1, 상품2 → product2 등)
    // 따라서 별도의 통합 로직 없이 원본 헤더 그대로 유지
    // 단, 단일 '상품' 필드는 SINGLE_CANONICAL 필드로 처리되며, 
    // applyHeaderMapping에서 별도로 처리됨
    
    // 옵션 계열 헤더는 MULTI-SLOT 필드로 분류하여 통합하지 않음
    // 각각 개별 필드로 유지 (옵션 → option, 옵션1 → option1, 옵션2 → option2 등)
    // 따라서 별도의 통합 로직 없이 원본 헤더 그대로 유지
    
    // 수량 alias 헤더 목록
    const aliasHeadersQuantity = [
      'amount',
      'count',
      'quantity',
      'qty',
      '수량EA',
      '개수',
      '구매수량',
      '주문수량',
      '수량',
    ];
    
    const canonicalHeaderQuantity = '수량';
    let canonicalValueQuantity: any = null;
    
    // 수량 alias 헤더들의 값을 canonical header로 통합
    aliasHeadersQuantity.forEach((aliasHeader) => {
      if (mappedRow[aliasHeader] !== undefined && mappedRow[aliasHeader] !== null && mappedRow[aliasHeader] !== '') {
        const value = mappedRow[aliasHeader];
        // 첫 번째 유효한 값 사용
        if (canonicalValueQuantity === null || canonicalValueQuantity === '') {
          canonicalValueQuantity = value;
        }
        // alias 헤더는 삭제
        delete mappedRow[aliasHeader];
      }
    });
    
    // 수량 canonical header 설정 (값이 있거나 없으면 null)
    if (canonicalValueQuantity !== null) {
      mappedRow[canonicalHeaderQuantity] = canonicalValueQuantity;
    } else if (mappedRow[canonicalHeaderQuantity] === undefined) {
      mappedRow[canonicalHeaderQuantity] = null;
    }
    
    // 배송요청사항 alias 헤더 목록
    const aliasHeadersRequest = [
      'delivery_memo',
      'delivery_request',
      '배송메시지',
      '요청사항',
      '배송메모',
      '배송요청사항',
    ];
    
    const canonicalHeaderRequest = '배송요청사항';
    let canonicalValueRequest: any = null;
    
    // 배송요청사항 alias 헤더들의 값을 canonical header로 통합
    aliasHeadersRequest.forEach((aliasHeader) => {
      if (mappedRow[aliasHeader] !== undefined && mappedRow[aliasHeader] !== null && mappedRow[aliasHeader] !== '') {
        const value = mappedRow[aliasHeader];
        // 첫 번째 유효한 값 사용
        if (canonicalValueRequest === null || canonicalValueRequest === '') {
          canonicalValueRequest = value;
        }
        // alias 헤더는 삭제
        delete mappedRow[aliasHeader];
      }
    });
    
    // 배송요청사항 canonical header 설정 (값이 있거나 없으면 null)
    if (canonicalValueRequest !== null) {
      mappedRow[canonicalHeaderRequest] = canonicalValueRequest;
    } else if (mappedRow[canonicalHeaderRequest] === undefined) {
      mappedRow[canonicalHeaderRequest] = null;
    }
    
    // 주문번호 alias 헤더 목록
    const aliasHeadersOrderNumber = [
      'order_code',
      'order_id',
      'order_number',
      '주문코드',
      '주문ID',
      '주문번호',
    ];
    
    const canonicalHeaderOrderNumber = '주문번호';
    let canonicalValueOrderNumber: any = null;
    
    // 주문번호 alias 헤더들의 값을 canonical header로 통합
    aliasHeadersOrderNumber.forEach((aliasHeader) => {
      if (mappedRow[aliasHeader] !== undefined && mappedRow[aliasHeader] !== null && mappedRow[aliasHeader] !== '') {
        const value = mappedRow[aliasHeader];
        // 첫 번째 유효한 값 사용
        if (canonicalValueOrderNumber === null || canonicalValueOrderNumber === '') {
          canonicalValueOrderNumber = value;
        }
        // alias 헤더는 삭제
        delete mappedRow[aliasHeader];
      }
    });
    
    // 주문번호 canonical header 설정 (값이 있거나 없으면 null)
    if (canonicalValueOrderNumber !== null) {
      mappedRow[canonicalHeaderOrderNumber] = canonicalValueOrderNumber;
    } else if (mappedRow[canonicalHeaderOrderNumber] === undefined) {
      mappedRow[canonicalHeaderOrderNumber] = null;
    }
    
    return mappedRow;
  });
  
  console.log('=== 원본 rows 데이터 ===');
  console.log('rows 배열 길이:', rows.length);
  console.log('rows 타입:', typeof rows);
  console.log('rows가 배열인가?', Array.isArray(rows));
  if (rows.length > 0) {
    console.log('첫 번째 row:', rows[0]);
    console.log('첫 번째 row의 키들:', Object.keys(rows[0]));
    console.log('첫 번째 row 상세:', JSON.stringify(rows[0], null, 2));
    if (rows.length > 1) {
      console.log('두 번째 row:', rows[1]);
      console.log('두 번째 row 상세:', JSON.stringify(rows[1], null, 2));
    }
    if (rows.length > 2) {
      console.log('세 번째 row:', rows[2]);
    }
  }
  console.log('전체 rows 구조:', rows);
  
  // 헤더 매핑 생성 및 적용 (한 번만 수행)
  try {
    console.log('=== 헤더 매핑 생성 시작 ===');
    const headerToFieldMap = generateHeaderToFieldMap(headerRow);
    console.log('헤더 매핑 결과:', headerToFieldMap);
    console.log('매핑된 헤더 개수:', Object.keys(headerToFieldMap).length);
    console.log('매핑 상세:', JSON.stringify(headerToFieldMap, null, 2));
    
    // 최종 헤더 매핑이 확정된 후, 사전·통계에 없는 신규 헤더를 learned header map에 저장
    saveLearnedHeaders(headerToFieldMap, headerRow);
    
    console.log('=== 헤더 매핑 적용 시작 ===');
    // 헤더 포함 전체 worksheetData 전달 (현재는 사용하지 않지만 호환성을 위해 전달)
    const mappedRows = applyHeaderMapping(rows, headerToFieldMap, worksheetData, headerRow);
    
    console.log('=== 매핑 적용 후 mappedRows ===');
    console.log('mappedRows 배열 길이:', mappedRows.length);
    console.log('mappedRows 타입:', typeof mappedRows);
    console.log('mappedRows가 배열인가?', Array.isArray(mappedRows));
    if (mappedRows.length > 0) {
      console.log('첫 번째 mappedRow:', mappedRows[0]);
      console.log('첫 번째 mappedRow의 키들:', Object.keys(mappedRows[0]));
      console.log('첫 번째 mappedRow 상세:', JSON.stringify(mappedRows[0], null, 2));
      if (mappedRows.length > 1) {
        console.log('두 번째 mappedRow:', mappedRows[1]);
        console.log('두 번째 mappedRow 상세:', JSON.stringify(mappedRows[1], null, 2));
      }
    }
    console.log('전체 mappedRows 구조:', mappedRows);
    
    console.log('=== parseExcel 함수 반환값 ===');
    console.log('반환할 데이터 타입:', typeof mappedRows);
    console.log('반환할 데이터 길이:', mappedRows.length);
    console.log('반환할 데이터 구조:', mappedRows);
    console.log('반환할 데이터 JSON:', JSON.stringify(mappedRows, null, 2));
    console.log('=== parseExcel 함수 종료 ===');
    
    return mappedRows;
  } catch (error) {
    // 매핑 실패 시 원본 rows 반환 (기존 파싱 흐름 유지)
    console.warn('헤더 매핑 처리 실패, 원본 데이터 반환:', error);
    console.log('=== 매핑 실패로 원본 rows 반환 ===');
    console.log('반환할 원본 rows 길이:', rows.length);
    console.log('반환할 원본 rows 구조:', rows);
    console.log('반환할 원본 rows JSON:', JSON.stringify(rows, null, 2));
    console.log('=== parseExcel 함수 종료 (원본 반환) ===');
    
    return rows;
  }
}

