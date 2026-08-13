import type { ReactNode } from 'react';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

export type MallSetupGuide = {
  title: string;
  sellerCenterHref?: string;
  sellerCenterLabel?: string;
  steps: { title: string; body: ReactNode }[];
  notes?: string[];
};

/** 오른쪽 안내 패널용 — 공식으로 확인된 주소·방법만 유지 (로그인 후 세부 클릭은 추후 스크린샷으로 보완) */
export const MALL_SETUP_GUIDES: Partial<Record<OrderIntegrationMallId, MallSetupGuide>> = {
  coupang: {
    title: '쿠팡 판매자센터 설정 방법',
    sellerCenterHref: 'https://wing.coupang.com',
    sellerCenterLabel: '쿠팡 Wing 바로가기',
    steps: [
      {
        title: 'Open API 메뉴',
        body: '쿠팡 Wing → 판매자정보 → 추가판매정보에서 Open API로 이동합니다.',
      },
      {
        title: '엑클로드 정보 등록',
        body: (
          <>
            업체명·URL·IP에 왼쪽(또는 상단)의 엑클로드 정보를 등록합니다. IP는 「추가」 후
            「확인」까지 완료하세요.
          </>
        ),
      },
      {
        title: '키 발급',
        body: '업체코드·Access Key·Secret Key를 확인한 뒤 왼쪽 입력란에 붙여넣습니다.',
      },
      {
        title: '저장·연결 테스트',
        body: '「저장」을 먼저 누른 뒤 「연결 테스트」를 합니다. 만료일을 넣으면 갱신 관리에 도움이 됩니다.',
      },
    ],
    notes: [
      '이미 API가 있으면 새 키보다 「연동정보 수정」으로 엑클로드 IP를 추가하는 방식을 권장합니다.',
      '처음이시면 「설정 따라하기」로 화면을 따라 진행하는 것을 권장합니다.',
    ],
  },
  eleven: {
    title: '11번가 판매자센터 설정 방법',
    sellerCenterHref: 'https://openapi.11st.co.kr',
    sellerCenterLabel: '11번가 OpenAPI',
    steps: [
      {
        title: '셀러오피스 → OPEN API 관리',
        body: (
          <>
            11번가 셀러오피스에 로그인한 뒤, 왼쪽 메뉴 맨 아래 <strong>OPEN API 관리</strong>로
            OPEN API CENTER에 들어갑니다.
          </>
        ),
      },
      {
        title: 'IP 직접입력 등록',
        body: (
          <>
            이용동의 후 <strong>IP 직접 입력</strong>을 「사용」으로 두고, 개발서버·개발자 PC·상용서버
            IP 세 칸 모두에 엑클로드 고정 IP(<strong>54.180.45.46</strong>)를 넣은 뒤 「등록하기」를
            누릅니다. (셀링툴 업체 선택은 하지 않습니다)
          </>
        ),
      },
      {
        title: '키 인증·복사',
        body: (
          <>
            API KEY 관리에서 <strong>인증하기</strong> 후 <strong>복사하기</strong>로 키를 복사합니다.
          </>
        ),
      },
      {
        title: '엑클로드 입력·연결 테스트',
        body: (
          <>
            왼쪽 칸에 계정명과 <strong>11ST OPEN API KEY</strong>를 넣고{' '}
            <strong>저장 → 연결 테스트</strong>를 합니다.
          </>
        ),
      },
    ],
    notes: [
      'IP는 세 칸에 동일한 엑클로드 고정 IP(54.180.45.46)를 넣습니다.',
      '처음이시면 「설정 따라하기」로 화면을 따라 진행하는 것을 권장합니다.',
    ],
  },
  smartstore: {
    title: '스마트스토어 설정 방법',
    sellerCenterHref: 'https://apicenter.commerce.naver.com',
    sellerCenterLabel: '네이버 커머스API센터',
    steps: [
      {
        title: '커머스API센터 접속',
        body: (
          <>
            네이버 <strong>커머스API센터</strong>에 들어갑니다. 스토어를 관리하는 계정(통합매니저)
            으로 로그인해 주세요.
          </>
        ),
      },
      {
        title: '내 스토어 앱 확인',
        body: (
          <>
            「내 스토어 애플리케이션」으로 이동합니다. <strong>이미 앱이 있으면 그대로 사용</strong>
            하고, 없으면 새로 등록합니다. 주문 관련 권한을 포함해 주세요.
          </>
        ),
      },
      {
        title: 'IP 등록',
        body: (
          <>
            앱 설정의 API 호출 IP에 왼쪽의 <strong>엑클로드 IP 54.180.45.46</strong>를 넣고
            「추가」합니다. (앱당 최대 3개)
          </>
        ),
      },
      {
        title: 'ID·시크릿 입력',
        body: (
          <>
            네이버에서 받은 <strong>ID·시크릿</strong>을 왼쪽 칸에 넣고,{' '}
            <strong>저장 → 연결 테스트</strong>를 합니다.
          </>
        ),
      },
    ],
    notes: [
      '판매자가 직접 만드는 「내 스토어 애플리케이션」 방식입니다. (솔루션마켓 구독과 다릅니다)',
      '서비스 URL·Redirect URI는 비워 두세요.',
      'API호출 IP는 최대 3개이며, 「추가」 후 「저장」까지 해야 반영됩니다. 엑클로드 IP(54.180.45.46)는 유지하세요.',
      '계정명은 구분용이라 보기 쉬운 이름으로, type은 SELF(기본)면 됩니다. 토큰 발급 등은 엑클로드가 처리합니다.',
      '처음이시면 「설정 따라하기」로 화면을 따라 진행하는 것을 권장합니다.',
    ],
  },
  cafe24: {
    title: '카페24 설정 방법',
    sellerCenterHref: 'https://developers.cafe24.com',
    sellerCenterLabel: '카페24 Developers',
    steps: [
      {
        title: 'Developers 로그인',
        body: '카페24 Developers에서 개인 연동 앱을 생성한 뒤, 아래 정보를 등록하고 발급받은 Client ID와 Client Secret을 왼쪽 입력란에 입력합니다.',
      },
      {
        title: '연동용 앱 생성',
        body: (
          <>
            Apps → App 관리에서 연동용 앱을 만듭니다. App URL은{' '}
            <strong>https://www.excload.com</strong>, Redirect URI는{' '}
            <strong>https://www.excload.com/api/order/integration/cafe24/callback</strong>, Scope는{' '}
            <strong>mall.read_order mall.write_order mall.read_shipping</strong> 으로 등록합니다.
          </>
        ),
      },
      {
        title: '엑클로드에 API 정보 입력',
        body: '발급된 Client ID·Client Secret과 쇼핑몰 ID(mallId)를 엑클로드에 입력·저장합니다.',
      },
      {
        title: '권한 동의·연결 테스트',
        body: '「카페24 연동 시작」으로 관리자 로그인·권한 동의를 한 뒤, 「연결 테스트」로 확인합니다. 권한이 부족하면 「권한 추가 재연동」을 진행하세요.',
      },
    ],
    notes: [
      '쇼핑몰 주소·관리자 아이디만으로는 주문을 조회할 수 없습니다. Client ID/Secret과 OAuth 동의가 필요합니다.',
      'Client Secret은 본인만 보관하고 외부에 공유하지 마세요.',
      '카페24에 엑클로드 고정 IP를 등록하는 단계는 없습니다.',
    ],
  },
  lotteon: {
    title: '롯데ON 설정 방법',
    sellerCenterHref: 'https://store.lotteon.com',
    sellerCenterLabel: '롯데ON 스토어',
    steps: [
      {
        title: 'OpenAPI관리',
        body: (
          <>
            스토어센터 로그인 후 「메뉴 전체보기」→ 「판매자정보」→ <strong>OpenAPI관리</strong>로
            이동합니다.
          </>
        ),
      },
      {
        title: '직접입력 · IP 등록',
        body: (
          <>
            1단계에서 <strong>직접입력</strong>을 체크하고, 서버 IP에 엑클로드 고정 IP(
            <strong>54.180.45.46</strong>)를 넣은 뒤 「저장하기」합니다. (호스팅/셀러툴 선택은 하지
            않습니다)
          </>
        ),
      },
      {
        title: '키발급·복사',
        body: (
          <>
            2단계에서 <strong>키발급</strong> 후 표의 <strong>복사</strong>로 인증키를 복사합니다.
          </>
        ),
      },
      {
        title: '엑클로드 입력·연결 테스트',
        body: (
          <>
            왼쪽 칸에 판매자 ID(로그인 ID)·거래처번호(tr_no, LO…)·API 인증 KEY를 넣고{' '}
            <strong>저장 → 연결 테스트</strong>를 합니다. 인증키는 보통 1년 유효합니다.
          </>
        ),
      },
    ],
    notes: [
      '서버 IP는 직접입력에 엑클로드 고정 IP(54.180.45.46)만 등록하면 됩니다.',
      '처음이시면 「설정 따라하기」로 화면을 따라 진행하는 것을 권장합니다.',
    ],
  },
  ssg: {
    title: 'SSG.COM 설정 방법',
    sellerCenterHref: 'https://po.ssgadm.com',
    sellerCenterLabel: 'SSG 파트너 오피스',
    steps: [
      {
        title: '파트너 오피스',
        body: (
          <>
            <strong>https://po.ssgadm.com</strong>에 로그인합니다. (입점·계약이 끝난 계정)
          </>
        ),
      },
      {
        title: 'IP 등록·키 활성화',
        body: (
          <>
            API 회원정보에 운영·테스트 서버 IP로 엑클로드 고정 IP(<strong>54.180.45.46</strong>)를
            등록하고, 이메일로 받은 API 인증키를 활성화합니다. (서비스 URL 등록 단계는 없습니다)
          </>
        ),
      },
      {
        title: '키 입력·테스트',
        body: '협력사코드(로그인 ID)와 API 인증키를 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
    ],
    notes: ['메뉴 이름이 화면과 다르면 로그인 후 스크린샷으로 확인해 주세요.'],
  },
  cjonstyle: {
    title: 'CJ온스타일 설정 방법',
    sellerCenterHref: 'https://partners.cjonstyle.com/standardApi/apiGuide',
    sellerCenterLabel: 'CJ온스타일 API 가이드',
    steps: [
      {
        title: '파트너시스템',
        body: '입점 협력사 계정으로 파트너시스템에 로그인합니다.',
      },
      {
        title: 'API 정보관리',
        body: (
          <>
            <strong>API 관리 → API 정보관리</strong>에서 기본정보를 등록한 뒤, 직접개발이면 운영(필요
            시 개발) IP에 엑클로드 고정 IP(<strong>54.180.45.46</strong>)를 등록하거나 셀러툴을
            선택합니다.
          </>
        ),
      },
      {
        title: '인증키 발급',
        body: 'API 인증키 발급 후 vendorCode(6자)·authenticationKey를 왼쪽에 넣고 저장합니다.',
      },
    ],
    notes: [
      '입점 협력사 전용입니다. 주문 API Path는 파트너 Docs 확인이 필요할 수 있습니다.',
    ],
  },
  shopby: {
    title: '샵바이 설정 방법',
    sellerCenterHref: 'https://workspace-help.nhn-commerce.com/contents/faq/server-api-1',
    sellerCenterLabel: '샵바이 Server API 안내',
    steps: [
      {
        title: 'systemKey',
        body: '워크스페이스 → 셀러어드민 → 상품 → (앱 클릭) → 앱 수정에서 systemKey를 확인합니다.',
      },
      {
        title: 'mallKey',
        body: '서비스어드민 → 서비스 관리 → 쇼핑몰 관리 → (쇼핑몰 선택) → 개발연동 정보 → 외부 연동 키(mallKey)를 확인합니다.',
      },
      {
        title: '키 입력',
        body: 'systemKey·mallKey를 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
    ],
    notes: [
      '샵바이는 판매자센터에 엑클로드 고정 IP·URL을 등록하는 단계가 없습니다.',
      '파트너어드민의 「외부시스템 연동코드」는 mallKey와 다릅니다.',
    ],
  },
  godomall: {
    title: '고도몰 설정 방법',
    sellerCenterHref: 'https://devcenter.godo.co.kr',
    sellerCenterLabel: '고도몰 개발자센터',
    steps: [
      {
        title: '제휴사 키 (엑클로드)',
        body: 'partner_key는 엑클로드가 NHN커머스 개발자센터에 제휴사로 등록해 보유합니다. 판매자가 직접 발급하지 않습니다.',
      },
      {
        title: '사용자키',
        body: '엑클로드(또는 NHN)에서 안내하는 사용자키 신청 URL로 쇼핑몰을 선택·신청하고, 승인된 user key를 왼쪽에 입력합니다.',
      },
      {
        title: '연결 테스트',
        body: '쇼핑몰 도메인·user key를 넣고 연결 테스트 후 저장합니다.',
      },
    ],
    notes: [
      '엑클로드 제휴사(partner_key) 준비가 끝나기 전에는 연결이 되지 않을 수 있습니다.',
    ],
  },
  makeshop: {
    title: '메이크샵 설정 방법',
    sellerCenterHref: 'https://developer.makeshop.co.kr',
    sellerCenterLabel: '메이크샵 Developers',
    steps: [
      {
        title: '엑클로드 APP',
        body: '엑클로드가 Developers에서 APP을 등록·심사하고 접근 허용 IP를 넣습니다. (판매자가 Client ID/Secret을 발급하는 방식이 아닙니다)',
      },
      {
        title: '앱 설치',
        body: '심사·출시된 엑클로드 APP을 샵스토어(또는 안내된 설치 경로)에서 설치하고 권한에 동의합니다.',
      },
      {
        title: 'shop_uid 입력',
        body: '상점 ID(shop_uid)를 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
    ],
    notes: [
      '레거시 shop_domain·shop_key 방식이 아닙니다. APP 심사 전에는 연결이 되지 않을 수 있습니다.',
    ],
  },
  domeggook: {
    title: '도매꾹 연동 준비',
    sellerCenterHref: 'https://mobile.domeggook.com/APIs/gate',
    sellerCenterLabel: '도매꾹 API 발급·관리 열기',
    steps: [
      {
        title: 'Open API Key 발급',
        body: (
          <>
            도매꾹에 로그인한 뒤 <strong>Open API → API Key 발급</strong>을 진행하세요.
            <br />
            카카오·네이버·애플 등 SNS로 가입한 계정은 API 로그인을 사용할 수 없습니다. 도매꾹 ID와
            비밀번호로 로그인 가능한 계정이 필요합니다.{' '}
            <a
              href="https://openapi.domeggook.com/ko/articles/%EB%A1%9C%EA%B7%B8%EC%9D%B8-e4aaf7c2"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              도매꾹 공식 로그인 API 안내
            </a>
          </>
        ),
      },
      {
        title: 'Private API 권한 신청',
        body: (
          <>
            <p>
              <strong>Private API → 권한신청</strong>을 누르고 왼쪽의 엑클로드 등록 정보를
              입력하세요.
            </p>
            <table className="mt-2 w-full border-collapse text-left text-xs text-zinc-700">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-2 py-1.5 font-semibold">신청 항목</th>
                  <th className="px-2 py-1.5 font-semibold">입력값</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-100">
                  <td className="px-2 py-1.5">업체명·서비스명</td>
                  <td className="px-2 py-1.5">엑클로드</td>
                </tr>
                <tr className="border-b border-zinc-100">
                  <td className="px-2 py-1.5">서비스 URL</td>
                  <td className="px-2 py-1.5">https://www.excload.com</td>
                </tr>
                <tr className="border-b border-zinc-100">
                  <td className="px-2 py-1.5">고정 IP</td>
                  <td className="px-2 py-1.5">54.180.45.46</td>
                </tr>
                <tr>
                  <td className="px-2 py-1.5 align-top">연동 목적</td>
                  <td className="px-2 py-1.5">
                    엑클로드 이용 도매꾹 공급사의 판매 주문 수집, 발주확인 및 배송·송장정보 전송을
                    위한 API 연동
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 font-semibold text-zinc-800">엑클로드용 권장 권한 — 총 6개</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              <li>공통: 로그인, 로그인 체크</li>
              <li>판매관리: 판매 주문서 목록 조회</li>
              <li>판매관리: 판매 주문서 상세 조회</li>
              <li>판매관리: 주문서 발주확인</li>
              <li>판매관리: 주문서 발송정보 입력 및 수정</li>
            </ul>
            <p className="mt-1.5 text-xs text-zinc-500">
              구매관리 권한과 판매취소·반품교환 권한은 선택하지 않아도 됩니다.
            </p>
          </>
        ),
      },
      {
        title: '승인 확인',
        body: (
          <>
            Private API는 신청 후 도매꾹 관리자의 승인이 필요합니다. 보통 영업일 기준 1~3일이
            소요되며 이메일과 도매꾹 알림으로 결과가 안내됩니다.{' '}
            <a
              href="https://openapi.domeggook.com/ko/articles/%EC%A4%91%EC%9A%94-%EB%8F%84%EB%A7%A4%EA%BE%B9-Private-API-%EA%B6%8C%ED%95%9C-%EC%8A%B9%EC%9D%B8%EC%A0%9C-%EB%8F%84%EC%9E%85-%EC%95%88%EB%82%B4-326-%EC%8B%9C%ED%96%89-1f097ec2"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              도매꾹 Private API 승인 안내
            </a>
          </>
        ),
      },
      {
        title: '엑클로드에 연결',
        body: (
          <>
            승인이 완료되면 왼쪽 입력란에 계정명, 도매꾹 회원 ID, 비밀번호, 발급받은 전체 API Key를
            입력하세요. 입력 후 <strong>저장 → 연결 테스트</strong> 순서로 진행하세요. 조회된 주문이
            0건이어도 연결 성공 메시지가 나오면 정상입니다.
          </>
        ),
      },
    ],
    notes: [
      '비밀번호와 API Key는 다른 사람에게 공유하지 마세요.',
      '주문조회 → 발주확인(setOrdChk) → 택배양식·송장 매칭 → 송장전송(setOrdOkDeli type=add) → getOrderView 반영 확인 순으로 진행합니다. 송장 수정(type=edit)·취소·반품·교환은 이번 범위에 포함되지 않습니다.',
      '송장전송 전에 연동 설정의 세금계산서 포함 여부(미포함/포함)를 선택해야 합니다.',
    ],
  },
};
