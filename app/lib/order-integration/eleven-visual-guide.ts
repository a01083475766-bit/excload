/**
 * 11번가 OPEN API 초보용 따라하기.
 * 단일 경로: IP 직접입력 + 개발/PC/상용 3칸에 동일 IP.
 * 이미지는 사용자가 표시를 넣어 둔 캡처를 그대로 사용한다.
 */

export type ElevenChecklistStep = {
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

const IMG = '/guides/eleven';

export const ELEVEN_OPENAPI_HREF = 'https://openapi.11st.co.kr';
export const ELEVEN_SELLER_OFFICE_HREF = 'https://soffice.11st.co.kr';

/** IP 직접입력 단일 경로 — 「네, 다음」쌓기 */
export const ELEVEN_GUIDE_STEPS: ElevenChecklistStep[] = [
  {
    kind: 'confirm',
    id: 'login',
    title: '셀러오피스 로그인',
    question: '11번가 셀러오피스에 로그인하셨나요?',
    howTo: [
      '① 아래 링크로 11번가 셀러오피스를 엽니다.',
      '② 판매자 계정으로 로그인합니다.',
    ],
    imageSrc: `${IMG}/01-login.jpg`,
    imageAlt: '11번가 셀러오피스 로그인 화면',
    externalHref: ELEVEN_SELLER_OFFICE_HREF,
    externalLabel: '셀러오피스 열기',
  },
  {
    kind: 'confirm',
    id: 'openapi-menu',
    title: 'OPEN API 관리',
    question: '왼쪽 메뉴 맨 아래 「OPEN API 관리」를 누르셨나요?',
    howTo: [
      '① 셀러오피스 왼쪽 메뉴를 맨 아래까지 내립니다.',
      '② 「OPEN API 관리」를 눌러 OPEN API CENTER로 이동합니다.',
    ],
    imageSrc: `${IMG}/02-openapi-menu.jpg`,
    imageAlt: '셀러오피스 OPEN API 관리 메뉴',
    tip: '새 창으로 OPEN API CENTER가 열립니다.',
  },
  {
    kind: 'confirm',
    id: 'agree-ip',
    title: '이용동의 · IP 직접입력 · 등록',
    question: '동의·IP 입력 후 「등록하기」까지 마치셨나요?',
    howTo: [
      '① 「동의합니다」 체크를 모두 합니다.',
      '② 접속권한에서 「IP 직접 입력」을 「사용」으로 둡니다.',
      '③ 개발서버 IP · 개발자 PC · 상용서버 IP 세 칸 모두에 엑클로드 IP 54.180.45.46 을 입력합니다.',
      '④ 「등록하기」를 누릅니다.',
    ],
    imageSrc: `${IMG}/03-agree-ip-register.jpg`,
    imageAlt: 'API 이용동의 및 IP 직접입력 등록 화면',
    tip: '셀링툴 업체 선택은 하지 않습니다. IP 직접입력만 사용합니다. 개발자 이메일은 본인 연락용으로 입력하세요.',
    imageHeightPx: 480,
  },
  {
    kind: 'confirm',
    id: 'authenticate',
    title: 'API KEY 인증하기',
    question: '「인증하기」를 눌러 2차 인증을 마치셨나요?',
    howTo: [
      '① API KEY 관리 화면에서 「인증하기」를 누릅니다.',
      '② 안내에 따라 2차 인증을 완료합니다. (키 확인에 필요합니다)',
    ],
    imageSrc: `${IMG}/04-authenticate.jpg`,
    imageAlt: 'API KEY 관리 인증하기 버튼',
  },
  {
    kind: 'confirm',
    id: 'copy-key',
    title: 'API KEY 복사',
    question: '「복사하기」로 키를 복사하셨나요?',
    howTo: [
      '① 인증 후 보이는 API KEY 옆 「복사하기」를 누릅니다.',
      '② 키가 클립보드에 복사되면 다음 단계로 진행합니다.',
    ],
    imageSrc: `${IMG}/05-copy-key.jpg`,
    imageAlt: 'API KEY 복사하기 버튼',
    tip: '「재발급」은 기존 키를 바꿉니다. 복사만 하면 됩니다.',
  },
  {
    kind: 'confirm',
    id: 'excload-input',
    title: '엑클로드에 입력·저장·연결 테스트',
    question: '계정명·키 입력 후 저장과 연결 테스트를 하셨나요?',
    howTo: [
      '① 엑클로드 왼쪽 「접속별칭(계정명)」에 구분용 이름을 적습니다.',
      '② 「11ST OPEN API KEY」에 복사한 키를 붙여넣습니다.',
      '③ 「저장」을 누른 뒤 「연결 테스트」를 합니다.',
    ],
    imageSrc: `${IMG}/06-excload-input.jpg`,
    imageAlt: '엑클로드 11번가 연동 정보 입력 화면',
    imageHeightPx: 460,
  },
  {
    kind: 'confirm',
    id: 'test-done',
    title: '연결 확인 · 주문연동으로 이동',
    question: '연결 성공을 확인하고 주문연동으로 이동할 준비가 되셨나요?',
    howTo: [
      '① 「11번가 API 연결이 정상 확인되었습니다」 안내가 보이면 완료입니다.',
      '② 「주문연동으로 이동」을 눌러 주문 조회·송장 작업을 이어갑니다.',
    ],
    imageSrc: `${IMG}/07-test-done.jpg`,
    imageAlt: '11번가 연결 테스트 성공 화면',
    tip: '저장과 연결 테스트가 모두 성공한 뒤에 주문연동으로 이동하세요.',
    imageHeightPx: 460,
  },
];

export function getElevenGuideSteps(): ElevenChecklistStep[] {
  return ELEVEN_GUIDE_STEPS;
}

export const ELEVEN_GUIDE_FOOTER =
  '안내 경로: 셀러오피스 → OPEN API 관리 → IP 직접입력(3칸 동일 IP) → 인증 → 키 복사 → 엑클로드 저장·연결 테스트.';
