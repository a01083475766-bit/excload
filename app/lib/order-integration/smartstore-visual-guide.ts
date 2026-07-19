/**
 * 스마트스토어 초보용 따라하기 가이드.
 * 공통 시작 → 화면 3장으로 경로 선택 → 「네, 다음」쌓기.
 * 이미지는 사용자가 표시를 넣어 둔 캡처를 그대로 사용한다.
 */

export type SmartstoreGuidePath = 'create' | 'existing' | 'blocked';

export type ChecklistConfirmStep = {
  kind: 'confirm';
  id: string;
  question: string;
  yesHint?: string;
  title: string;
  howTo: string[];
  imageSrc: string;
  imageAlt: string;
  tip?: string;
  /** 단계별 이미지 표시 높이(px). 없으면 density 기본값 */
  imageHeightPx?: number;
};

export type PathChoice = {
  path: SmartstoreGuidePath;
  /** 초보용 짧은 말 (용어 최소화) */
  label: string;
  hint: string;
  imageSrc: string;
  imageAlt: string;
};

const IMG = '/guides/smartstore';

/** 경로 고르기용 카드 3장 */
export const SMARTSTORE_PATH_CHOICES: PathChoice[] = [
  {
    path: 'create',
    label: '이런 창이 뜨고 「계정생성」을 누를 수 있어요',
    hint: '처음 설정하는 경우',
    imageSrc: `${IMG}/path-create-account.png`,
    imageAlt: '계정생성이 가능한 안내 화면',
  },
  {
    path: 'existing',
    label: '이미 앱이 있거나, 「1개까지」 안내가 나와요',
    hint: '예전에 만든 앱이 있는 경우',
    imageSrc: `${IMG}/b-app-list.png`,
    imageAlt: '이미 등록된 애플리케이션 목록',
  },
  {
    path: 'blocked',
    label: '계정을 만들 수 없다는 안내가 나와요',
    hint: '권한이 없거나 대상이 아닌 경우',
    imageSrc: `${IMG}/path-cannot-create.png`,
    imageAlt: '계정생성 대상이 아닙니다 안내 화면',
  },
];

const START_STEP: ChecklistConfirmStep = {
  kind: 'confirm',
  id: 'start',
  title: '커머스API센터 열기',
  question: '「시작하기」를 누르고 들어가셨나요?',
  yesHint: '들어가셨으면 「네, 다음」을 누르세요',
  howTo: [
    '① 아래 링크로 네이버 커머스API센터를 엽니다.',
    '② 초록 「커머스API센터 시작하기」를 누릅니다.',
    '③ 스마트스토어를 관리하는 계정으로 로그인합니다.',
    '④ 이후에는 「내 스토어 애플리케이션」만 사용합니다. (솔루션마켓 앱과 다릅니다)',
  ],
  imageSrc: `${IMG}/c0-start.png`,
  imageAlt: '커머스API센터 시작 화면',
};

const CREATE_STEPS: ChecklistConfirmStep[] = [
  {
    kind: 'confirm',
    id: 'a-account',
    title: '계정 정보 입력',
    question: '계정 정보를 입력하고 생성을 마치셨나요?',
    yesHint: '이미 끝난 상태면 「네, 다음」',
    howTo: [
      '① 화면에 나온 대로 계정 정보를 입력합니다.',
      '② 이메일 인증·약관 동의가 있으면 함께 진행합니다.',
    ],
    imageSrc: `${IMG}/a-account-form.png`,
    imageAlt: '계정 정보 입력 화면',
  },
  {
    kind: 'confirm',
    id: 'a-register-btn',
    title: '앱 등록 시작',
    question: '「등록하기」를 누르셨나요?',
    howTo: ['① 「애플리케이션 등록」의 초록 「등록하기」를 누릅니다.'],
    imageSrc: `${IMG}/a-register-btn.png`,
    imageAlt: '등록하기 버튼 화면',
  },
  {
    kind: 'confirm',
    id: 'a-name-ip',
    title: '이름·IP 입력',
    question: '이름·설명을 적고 IP를 「추가」하셨나요?',
    howTo: [
      '① 앱 이름·설명을 간단히 적습니다.',
      '② IP에 54.180.45.46 을 넣고 「추가」를 꼭 누릅니다.',
      '③ API호출 IP는 최대 3개까지입니다. 엑클로드 IP(54.180.45.46)는 꼭 남겨 두세요.',
    ],
    imageSrc: `${IMG}/a-name-ip.png`,
    imageAlt: '이름·IP 입력 화면',
    tip: 'IP는 입력만 하면 안 되고 「추가」를 눌러야 등록됩니다. 나중에 등록 화면에서 「등록·저장」도 완료하세요.',
  },
  {
    kind: 'confirm',
    id: 'a-api-group',
    title: '주문 권한 추가',
    question: '「주문 판매자」 등을 「추가」하셨나요?',
    howTo: [
      '① 「주문 판매자」 오른쪽 「추가」를 누릅니다.',
      '② 「판매자정보」도 「추가」해 두면 이후 기능 확장 때 다시 설정할 일이 줄어듭니다.',
    ],
    imageSrc: `${IMG}/a-api-group.png`,
    imageAlt: 'API 그룹 추가 화면',
    tip: '지금 당장 쓰지 않더라도 「주문 판매자·판매자정보」를 미리 넣어 두는 것을 권장합니다.',
  },
  {
    kind: 'confirm',
    id: 'a-submit',
    title: '등록하기',
    question: '체크 후 「등록」을 누르셨나요?',
    howTo: [
      '① 「인증 토큰 표준 스펙…」을 체크합니다.',
      '② 아래 「등록」을 누릅니다.',
    ],
    imageSrc: `${IMG}/a-register-submit.png`,
    imageAlt: '등록 버튼 화면',
  },
  {
    kind: 'confirm',
    id: 'a-done',
    title: '등록 완료',
    question: '완료 안내에서 「확인」을 누르셨나요?',
    howTo: ['① 「확인」을 누릅니다.'],
    imageSrc: `${IMG}/a-register-done.png`,
    imageAlt: '등록 완료 화면',
  },
  {
    kind: 'confirm',
    id: 'a-detail',
    title: 'ID·시크릿 확인',
    question: '앱 상세에서 ID와 시크릿을 확인하셨나요?',
    howTo: [
      '① 「애플리케이션 ID」를 확인합니다.',
      '② 「시크릿」은 「보기」 후 「복사」합니다.',
    ],
    imageSrc: `${IMG}/a-secret-detail.png`,
    imageAlt: '애플리케이션 상세 화면',
    tip: '시크릿은 비밀번호처럼 다루세요. 다른 곳에 올리지 마세요.',
  },
];

const EXISTING_STEPS: ChecklistConfirmStep[] = [
  {
    kind: 'confirm',
    id: 'b-limit',
    title: '새 앱은 만들지 않기',
    question: '「1개까지」 안내가 나오면 「확인」만 누르셨나요?',
    yesHint: '안내가 안 뜨면 「네, 다음」으로 넘어가도 됩니다',
    howTo: [
      '① 이미 앱이 있으면 새로 만들지 않습니다.',
      '② 안내 창이 뜨면 「확인」만 누릅니다.',
    ],
    imageSrc: `${IMG}/b-limit-popup.png`,
    imageAlt: '애플리케이션 등록 제한 안내',
  },
  {
    kind: 'confirm',
    id: 'b-list',
    title: '기존 앱 열기',
    question: '목록에서 기존 앱 이름을 누르셨나요?',
    howTo: [
      '① 「내 스토어 애플리케이션」 목록에서 사용 중인 앱을 클릭합니다.',
      '② 솔루션마켓 앱이 아니라 「내 스토어 애플리케이션」인지 확인하세요.',
    ],
    imageSrc: `${IMG}/b-app-list.png`,
    imageAlt: '기존 애플리케이션 목록',
  },
  {
    kind: 'confirm',
    id: 'b-edit',
    title: '수정 누르기',
    question: '「수정」을 누르셨나요?',
    howTo: ['① 앱 상세에서 「수정」을 누릅니다.'],
    imageSrc: `${IMG}/b-edit-click.png`,
    imageAlt: '수정 버튼 화면',
  },
  {
    kind: 'confirm',
    id: 'b-ip',
    title: '엑클로드 IP 추가',
    question: 'IP 54.180.45.46 을 「추가」하셨나요?',
    howTo: [
      '① 기존 IP는 지우지 않습니다. (앱당 최대 3개)',
      '② 54.180.45.46 을 넣고 「추가」를 누릅니다.',
      '③ 엑클로드 IP는 유지하세요. 「저장」은 다음 단계(주문 권한)까지 끝낸 뒤 한 번에 해도 됩니다.',
    ],
    imageSrc: `${IMG}/b-add-ip.png`,
    imageAlt: 'IP 추가 화면',
    tip: 'IP만 입력하고 「추가」를 빼면 목록에 안 들어갑니다.',
  },
  {
    kind: 'confirm',
    id: 'b-api-group',
    title: '주문 권한 확인',
    question: '「주문 판매자」를 확인하고 「저장」하셨나요?',
    howTo: [
      '① 「주문 판매자」가 없으면 오른쪽 「추가」를 누릅니다.',
      '② 「판매자정보」도 없으면 「추가」해 두세요. (다른 연동·추후 기능에도 도움이 됩니다)',
      '③ IP·권한 변경이 끝났으면 반드시 「저장」을 누릅니다.',
    ],
    imageSrc: `${IMG}/a-api-group.png`,
    imageAlt: 'API 그룹 확인·추가 화면',
    tip: '이미 추가된 항목은 그대로 두면 됩니다. 없는 것만 추가한 뒤 「저장」하세요.',
  },
  {
    kind: 'confirm',
    id: 'b-detail',
    title: 'ID·시크릿 확인',
    question: '앱 상세에서 ID와 시크릿을 「보기·복사」하셨나요?',
    howTo: [
      '① 저장이 끝난 뒤 앱 상세에서 「애플리케이션 ID」를 확인합니다.',
      '② 「시크릿」은 「보기」 후 「복사」합니다.',
    ],
    imageSrc: `${IMG}/a-secret-detail.png`,
    imageAlt: '애플리케이션 상세 화면',
    tip: '시크릿은 비밀번호처럼 다루세요. 다른 곳에 올리지 마세요.',
  },
];

/** 1·2번 공통 — ID/시크릿 → 엑클로드 → 주문조회 */
const SHARED_TAIL: ChecklistConfirmStep[] = [
  {
    kind: 'confirm',
    id: 'summary',
    title: '서로 넣는 값 한눈에 보기',
    question: '어떤 값을 어디에 넣는지 이해되셨나요?',
    howTo: [
      '① 네이버 앱에는 엑클로드 IP(54.180.45.46)를 넣습니다. (최대 3개·추가 후 저장)',
      '② 엑클로드에는 네이버의 ID·시크릿을 넣습니다.',
    ],
    imageSrc: `${IMG}/shared-values-summary.png`,
    imageAlt: '네이버와 엑클로드에 넣는 값 요약',
  },
  {
    kind: 'confirm',
    id: 'paste',
    title: '엑클로드에 붙여넣기',
    question: '왼쪽에 ID·시크릿을 붙여넣으셨나요?',
    howTo: [
      '① 네이버에서 ID·시크릿을 복사합니다.',
      '② 엑클로드 왼쪽 칸에 붙여넣습니다.',
      '③ 계정명은 구분용이라 본인이 보기 쉬운 이름으로 적어도 됩니다.',
      '④ type은 SELF(기본값)면 됩니다.',
    ],
    imageSrc: `${IMG}/shared-id-secret-paste.png`,
    imageAlt: '엑클로드에 ID·시크릿 입력',
  },
  {
    kind: 'confirm',
    id: 'save',
    title: '저장',
    question: '「저장」을 누르셨나요?',
    howTo: [
      '① ID·시크릿을 붙여넣은 뒤, 반드시 「저장」을 먼저 누릅니다.',
      '② 저장하지 않으면 연결 테스트가 안 될 수 있습니다.',
    ],
    imageSrc: `${IMG}/shared-save.png`,
    imageAlt: '저장 버튼',
  },
  {
    kind: 'confirm',
    id: 'test',
    title: '연결 테스트',
    question: '「연결 테스트」를 누르셨나요?',
    howTo: ['① 저장이 끝난 뒤 「연결 테스트」를 누릅니다.'],
    imageSrc: `${IMG}/shared-test.png`,
    imageAlt: '연결 테스트 버튼',
  },
  {
    kind: 'confirm',
    id: 'done-move',
    title: '설정 완료',
    question: '완료 안내가 보이면 「주문연동으로 이동」을 누르셨나요?',
    howTo: ['① 초록 완료 안내를 확인한 뒤 「주문연동으로 이동」을 누릅니다.'],
    imageSrc: `${IMG}/shared-done-move.png`,
    imageAlt: '연결 완료 후 이동',
    tip: '여기까지면 「설정됨」입니다. 실제 주문은 주문조회에서 확인합니다.',
  },
  {
    kind: 'confirm',
    id: 'order-hub',
    title: '주문조회 열기',
    question: '「주문조회 하기」를 누르셨나요?',
    howTo: ['① 「주문조회 하기」를 누릅니다.'],
    imageSrc: `${IMG}/shared-order-hub.png`,
    imageAlt: '주문조회 하기 버튼',
  },
  {
    kind: 'confirm',
    id: 'order-fetch',
    title: '연결 확인 후 검색',
    question: '「연결 정상」을 확인하고 「검색」을 누르셨나요?',
    howTo: [
      '① 스마트스토어가 「연결 정상」인지 봅니다.',
      '② 기간을 고른 뒤 「검색」을 누릅니다.',
    ],
    imageSrc: `${IMG}/shared-order-fetch.png`,
    imageAlt: '주문조회 검색 화면',
  },
];

const BLOCKED_STEPS: ChecklistConfirmStep[] = [
  {
    kind: 'confirm',
    id: 'blocked-extra',
    title: '참고 화면',
    question: '「계정생성 대상이 아닙니다」 안내를 확인하셨나요?',
    howTo: ['① 「계정생성 대상이 아닙니다」 안내가 나오면 아래와 같이 진행합니다.'],
    imageSrc: `${IMG}/path-cannot-create.png`,
    imageAlt: '권한 안내 화면',
  },
  {
    kind: 'confirm',
    id: 'blocked-notice',
    title: '계정 생성이 안 되는 경우',
    question: '안내 내용을 확인하셨나요?',
    howTo: [
      '① 엑클로드에서 대신 해결할 수 없는 상황입니다.',
      '② 스마트스토어센터에서 통합매니저 권한·스토어 상태를 확인하세요.',
      '③ 해결이 어려우면 네이버(스마트스토어) 고객센터에 문의해 주세요.',
    ],
    imageSrc: `${IMG}/path-cannot-create-detail.png`,
    imageAlt: '계정 생성 불가 상세 안내',
    tip: '네이버 고객센터에서 확인 후 사용이 가능한 부분입니다. 권한·스토어 상태가 맞춰진 뒤, 다시 커머스API센터에서 시작해 주세요.',
  },
];

export function getSmartstoreStartStep(): ChecklistConfirmStep {
  return START_STEP;
}

export function getSmartstorePathSteps(path: SmartstoreGuidePath): ChecklistConfirmStep[] {
  if (path === 'create') return [...CREATE_STEPS, ...SHARED_TAIL];
  if (path === 'existing') return [...EXISTING_STEPS, ...SHARED_TAIL];
  return BLOCKED_STEPS;
}

export const SMARTSTORE_GUIDE_FOOTER =
  '설정이 끝나면 주문조회에서 「연결 정상」인지 확인한 뒤 검색하세요. 설정만 했다고 주문이 자동으로 뜨지는 않습니다.';

export const SMARTSTORE_API_CENTER_HREF = 'https://apicenter.commerce.naver.com';

/** @deprecated 모달·인라인 공통 컴포넌트가 새 API를 사용합니다 */
export type SmartstoreGuideStep = {
  id: string;
  title: string;
  captions: string[];
  imageSrc: string;
  imageAlt: string;
  tip?: string;
};

export function getSmartstoreGuideSteps(
  path: 'new' | 'existing',
): SmartstoreGuideStep[] {
  const mapped = path === 'new' ? 'create' : 'existing';
  return getSmartstorePathSteps(mapped).map((s) => ({
    id: s.id,
    title: s.title,
    captions: s.howTo,
    imageSrc: s.imageSrc,
    imageAlt: s.imageAlt,
    tip: s.tip,
  }));
}
