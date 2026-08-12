/**
 * 롯데ON OpenAPI 초보용 따라하기.
 * 단일 경로: 직접입력 + 서버 IP에 엑클로드 고정 IP.
 * 이미지는 사용자가 표시를 넣어 둔 캡처를 그대로 사용한다.
 */

export type LotteonChecklistStep = {
  kind: 'confirm';
  id: string;
  question: string;
  title: string;
  howTo: string[];
  imageSrc: string;
  imageAlt: string;
  tip?: string;
  imageHeightPx?: number;
  externalHref?: string;
  externalLabel?: string;
};

const IMG = '/guides/lotteon';

export const LOTTEON_STORE_HREF = 'https://store.lotteon.com';

/** 직접입력 단일 경로 — 「네, 다음」쌓기 */
export const LOTTEON_GUIDE_STEPS: LotteonChecklistStep[] = [
  {
    kind: 'confirm',
    id: 'openapi-menu',
    title: 'OpenAPI관리 메뉴',
    question: '「OpenAPI관리」 화면까지 들어가셨나요?',
    howTo: [
      '① 아래 링크로 롯데ON 스토어센터에 로그인합니다.',
      '② 왼쪽 「메뉴 전체보기」를 누릅니다.',
      '③ 「판매자정보」에서 「OpenAPI관리」를 선택합니다.',
    ],
    imageSrc: `${IMG}/01-openapi-menu.jpg`,
    imageAlt: '롯데ON 메뉴 전체보기에서 OpenAPI관리 선택',
    externalHref: LOTTEON_STORE_HREF,
    externalLabel: '롯데ON 스토어센터 열기',
    imageHeightPx: 460,
  },
  {
    kind: 'confirm',
    id: 'ip-and-issue',
    title: '직접입력 · IP 등록 · 키발급',
    question: 'IP 저장 후 「키발급」까지 하셨나요?',
    howTo: [
      '① 1단계 「서버 IP 등록」에서 「직접입력」을 체크합니다.',
      '② 서버 IP에 엑클로드 IP 54.180.45.46 을 입력합니다.',
      '③ 「저장하기」를 누릅니다.',
      '④ 2단계에서 「키발급」을 누릅니다.',
    ],
    imageSrc: `${IMG}/02-ip-direct-key-issue.jpg`,
    imageAlt: '직접입력 IP 등록 및 키발급 화면',
    tip: '호스팅/셀러툴 선택은 하지 않습니다. 직접입력만 사용합니다.',
    imageHeightPx: 460,
  },
  {
    kind: 'confirm',
    id: 'copy-key',
    title: '인증키 복사',
    question: '「복사」로 인증키를 복사하셨나요?',
    howTo: [
      '① 인증키 표에서 「복사」를 누릅니다.',
      '② 키가 클립보드에 복사되면 다음 단계로 진행합니다.',
    ],
    imageSrc: `${IMG}/03-copy-key.jpg`,
    imageAlt: '롯데ON 인증키 복사 버튼',
    tip: '유효기간은 보통 1년입니다. 만료 전에 다시 발급·등록하면 됩니다.',
    imageHeightPx: 440,
  },
  {
    kind: 'confirm',
    id: 'trno-and-key',
    title: '거래처번호·인증키 입력',
    question: '거래처번호(tr_no)와 API 인증 KEY를 왼쪽 칸에 넣으셨나요?',
    howTo: [
      '① 스토어센터 왼쪽 프로필 아래의 LO로 시작하는 번호를 「거래처번호(tr_no)」에 넣습니다.',
      '② 복사한 인증키를 「API 인증 KEY」에 붙여넣습니다.',
    ],
    imageSrc: `${IMG}/04-trno-and-key.jpg`,
    imageAlt: '엑클로드에 거래처번호와 인증키 입력',
    imageHeightPx: 460,
  },
  {
    kind: 'confirm',
    id: 'seller-id',
    title: '판매자 ID 입력',
    question: '판매자 ID를 입력하셨나요?',
    howTo: [
      '① 롯데ON 스토어센터 로그인에 쓰는 ID를 「판매자 ID」에 입력합니다.',
      '② 접속별칭(계정명)은 구분용으로 보기 쉬운 이름을 적으면 됩니다.',
    ],
    imageSrc: `${IMG}/05-seller-id.jpg`,
    imageAlt: '로그인 ID를 엑클로드 판매자 ID에 입력',
    tip: 'Shop ID는 선택 항목입니다. 일반 연동에서는 비워 두셔도 됩니다.',
    imageHeightPx: 440,
  },
  {
    kind: 'confirm',
    id: 'save-test',
    title: '저장 · 연결 테스트',
    question: '「저장」과 「연결 테스트」를 하셨나요?',
    howTo: [
      '① 「저장」을 먼저 누릅니다.',
      '② 「연결 테스트」로 API 연결을 확인합니다.',
      '③ 성공하면 주문연동 화면에서 주문 조회·송장 작업을 이어갑니다.',
    ],
    imageSrc: `${IMG}/06-save-test.jpg`,
    imageAlt: '엑클로드 롯데ON 저장 및 연결 테스트',
    imageHeightPx: 440,
  },
];

export function getLotteonGuideSteps(): LotteonChecklistStep[] {
  return LOTTEON_GUIDE_STEPS;
}

export const LOTTEON_GUIDE_FOOTER =
  '안내 경로: 스토어센터 → OpenAPI관리 → 직접입력·IP 저장 → 키발급·복사 → 판매자 ID·tr_no·KEY 입력 → 저장·연결 테스트.';
