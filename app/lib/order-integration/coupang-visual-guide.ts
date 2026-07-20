/**
 * 쿠팡 Wing Open API 초보용 따라하기.
 * 공통 시작 → 화면 2장으로 경로 선택 → 「네, 다음」쌓기.
 * 이미지는 사용자가 표시를 넣어 둔 캡처를 그대로 사용한다. (8번 없음)
 */

export type CoupangGuidePath = 'create' | 'existing';

export type CoupangChecklistStep = {
  kind: 'confirm';
  id: string;
  question: string;
  title: string;
  howTo: string[];
  imageSrc: string;
  imageAlt: string;
  tip?: string;
  imageHeightPx?: number;
  /** 시작 단계 등 외부 링크 */
  externalHref?: string;
  externalLabel?: string;
};

export type CoupangPathChoice = {
  path: CoupangGuidePath;
  label: string;
  hint: string;
  imageSrc: string;
  imageAlt: string;
};

const IMG = '/guides/coupang';

export const COUPANG_WING_HREF = 'https://wing.coupang.com';

export const COUPANG_PATH_CHOICES: CoupangPathChoice[] = [
  {
    path: 'create',
    label: 'Open API 키를 처음 발급받아요',
    hint: '처음 설정하는 경우',
    imageSrc: `${IMG}/05-api-issue.jpg`,
    imageAlt: 'API 발급받기 화면',
  },
  {
    path: 'existing',
    label: '이미 API가 있어 연동정보만 수정해요',
    hint: '예전에 키를 만든 경우',
    imageSrc: `${IMG}/a1-edit-integration.jpg`,
    imageAlt: '연동정보 수정 화면',
  },
];

const START_STEP: CoupangChecklistStep = {
  kind: 'confirm',
  id: 'start',
  title: '쿠팡 Wing 로그인',
  question: 'Wing에 로그인하셨나요?',
  howTo: [
    '① 아래 링크로 쿠팡 Wing 판매자센터를 엽니다.',
    '② 스마트스토어가 아니라 쿠팡 판매자 계정으로 로그인합니다.',
  ],
  imageSrc: `${IMG}/01-login.jpg`,
  imageAlt: '쿠팡 Wing 로그인 화면',
  externalHref: COUPANG_WING_HREF,
  externalLabel: '쿠팡 Wing 열기',
};

const CREATE_STEPS: CoupangChecklistStep[] = [
  {
    kind: 'confirm',
    id: 'c-seller',
    title: '판매자정보',
    question: '「판매자정보」 메뉴로 들어가셨나요?',
    howTo: ['① 왼쪽(또는 상단) 메뉴에서 「판매자정보」를 누릅니다.'],
    imageSrc: `${IMG}/02-seller-info.jpg`,
    imageAlt: '판매자정보 메뉴',
  },
  {
    kind: 'confirm',
    id: 'c-extra',
    title: '추가판매정보',
    question: '「추가판매정보」로 들어가셨나요?',
    howTo: ['① 「추가판매정보」를 눌러 Open API 설정 화면으로 이동합니다.'],
    imageSrc: `${IMG}/03-extra-seller-info.jpg`,
    imageAlt: '추가판매정보 화면',
  },
  {
    kind: 'confirm',
    id: 'c-password',
    title: '비밀번호 확인',
    question: '비밀번호를 입력하고 확인하셨나요?',
    howTo: ['① 안내에 따라 비밀번호를 입력합니다.', '② 확인이 끝나면 다음 화면으로 넘어갑니다.'],
    imageSrc: `${IMG}/04-password.jpg`,
    imageAlt: '비밀번호 입력 화면',
  },
  {
    kind: 'confirm',
    id: 'c-api-issue',
    title: 'API 발급받기',
    question: '「API 발급받기」를 누르셨나요?',
    howTo: ['① Open API 키 발급 관련 「발급받기」를 누릅니다.'],
    imageSrc: `${IMG}/05-api-issue.jpg`,
    imageAlt: 'API 발급받기',
  },
  {
    kind: 'confirm',
    id: 'c-purpose',
    title: '사용목적',
    question: '사용목적을 선택·입력하셨나요?',
    howTo: ['① 안내에 맞는 사용목적을 고르거나 입력합니다.'],
    imageSrc: `${IMG}/06-purpose.jpg`,
    imageAlt: '사용목적 선택',
  },
  {
    kind: 'confirm',
    id: 'c-terms',
    title: '약관 동의·발급',
    question: '약관에 동의하고 발급을 진행하셨나요?',
    howTo: ['① 약관을 확인하고 동의합니다.', '② 「발급받기」를 눌러 진행합니다.'],
    imageSrc: `${IMG}/07-terms-issue.jpg`,
    imageAlt: '약관동의 및 발급',
  },
  {
    kind: 'confirm',
    id: 'c-self-dev',
    title: '자체개발 직접입력',
    question: '「자체개발」·직접입력 쪽으로 진행하셨나요?',
    howTo: [
      '① 솔루션 구독이 아니라 「자체개발」·직접입력 방식을 선택합니다.',
      '② 엑클로드에 넣을 업체명·URL·IP를 준비합니다.',
    ],
    imageSrc: `${IMG}/09-self-dev.jpg`,
    imageAlt: '자체개발 직접입력',
  },
  {
    kind: 'confirm',
    id: 'c-paste-info',
    title: '엑클로드 정보 붙여넣기',
    question: '업체명·URL·IP를 붙여넣으셨나요?',
    howTo: [
      '① 엑클로드 화면의 업체명·URL·IP를 복사합니다.',
      '② 쿠팡 연동정보 칸에 붙여넣습니다.',
      '③ IP는 엑클로드에 표시된 고정 IP를 그대로 사용합니다.',
    ],
    imageSrc: `${IMG}/10-paste-excload-info.jpg`,
    imageAlt: '주소·IP 붙여넣기',
    tip: 'IP는 입력만 하지 말고, 다음 단계에서 「추가·확인」까지 완료하세요.',
  },
  {
    kind: 'confirm',
    id: 'c-add-confirm',
    title: '추가·확인',
    question: '「추가」와 「확인」을 누르셨나요?',
    howTo: [
      '① IP·정보를 넣은 뒤 「추가」를 누릅니다.',
      '② 「확인」까지 눌러 저장·반영합니다.',
    ],
    imageSrc: `${IMG}/11-add-confirm.jpg`,
    imageAlt: '추가 확인 버튼',
  },
  {
    kind: 'confirm',
    id: 'c-key-done',
    title: 'API 키 발급 완료',
    question: 'API 키 발급 완료 화면이 보이시나요?',
    howTo: ['① 발급 완료 상태를 확인합니다.', '② 다음 단계에서 업체코드·Access Key·Secret Key를 확인합니다.'],
    imageSrc: `${IMG}/12-key-done.jpg`,
    imageAlt: 'API 키 발급 완료',
  },
];

const EXISTING_STEPS: CoupangChecklistStep[] = [
  {
    kind: 'confirm',
    id: 'e-edit',
    title: '연동정보 수정',
    question: '「수정」을 누르셨나요?',
    howTo: [
      '① 이미 API가 있는 화면에서 「연동정보」의 「수정」을 누릅니다.',
      '② 새 키를 또 만들기보다, 기존 연동에 엑클로드 IP를 추가합니다.',
    ],
    imageSrc: `${IMG}/a1-edit-integration.jpg`,
    imageAlt: '연동정보 수정 클릭',
  },
  {
    kind: 'confirm',
    id: 'e-ip',
    title: '엑클로드 IP 추가',
    question: 'IP를 「추가」하고 확인하셨나요?',
    howTo: [
      '① 엑클로드 고정 IP를 넣고 「추가」를 누릅니다.',
      '② 기존 IP는 가능하면 지우지 않습니다.',
      '③ 「확인」까지 눌러 반영합니다.',
    ],
    imageSrc: `${IMG}/a2-add-ip.jpg`,
    imageAlt: 'IP 추가 후 확인',
    tip: 'IP만 입력하고 「추가·확인」을 빼면 연동이 실패할 수 있습니다.',
  },
];

const SHARED_TAIL: CoupangChecklistStep[] = [
  {
    kind: 'confirm',
    id: 'keys',
    title: '엑클로드에 넣을 값 확인',
    question: '업체코드·Access Key·Secret Key를 확인하셨나요?',
    howTo: [
      '① 쿠팡 화면에서 「업체코드」「Access Key」「Secret Key」를 확인합니다.',
      '② 세 값을 엑클로드 왼쪽(연동 정보 입력)에 넣을 예정입니다.',
    ],
    imageSrc: `${IMG}/13-keys-to-excload.jpg`,
    imageAlt: '엑클로드에 입력할 API 값',
    tip: 'Secret Key는 비밀번호처럼 다루세요. 다른 곳에 올리지 마세요.',
  },
  {
    kind: 'confirm',
    id: 'paste-save',
    title: '엑클로드에 입력·저장',
    question: '값을 붙여넣고 「저장」을 누르셨나요?',
    howTo: [
      '① 업체코드·Access Key·Secret Key를 엑클로드에 붙여넣습니다.',
      '② 계정명은 구분용이라 보기 쉬운 이름으로 적어도 됩니다.',
      '③ 반드시 「저장」을 먼저 누릅니다.',
    ],
    imageSrc: `${IMG}/14-excload-save.jpg`,
    imageAlt: '엑클로드 저장',
  },
  {
    kind: 'confirm',
    id: 'test',
    title: '연결 테스트',
    question: '「연결 테스트」까지 확인하셨나요?',
    howTo: [
      '① 저장이 끝난 뒤 「연결 테스트」를 누릅니다.',
      '② 성공하면 주문연동 화면에서 주문을 검색할 수 있습니다.',
    ],
    imageSrc: `${IMG}/15-save-test.jpg`,
    imageAlt: '저장 및 연결 테스트',
    tip: '여기까지면 「설정됨」입니다. 실제 주문은 주문조회에서 확인합니다.',
  },
];

export function getCoupangStartStep(): CoupangChecklistStep {
  return START_STEP;
}

export function getCoupangPathSteps(path: CoupangGuidePath): CoupangChecklistStep[] {
  if (path === 'create') return [...CREATE_STEPS, ...SHARED_TAIL];
  return [...EXISTING_STEPS, ...SHARED_TAIL];
}

export const COUPANG_GUIDE_FOOTER =
  '설정이 끝나면 주문조회에서 쿠팡이 「연결 정상」인지 확인한 뒤 검색하세요. 설정만 했다고 주문이 자동으로 뜨지는 않습니다.';
