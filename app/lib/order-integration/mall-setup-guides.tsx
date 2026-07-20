import type { ReactNode } from 'react';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

export type MallSetupGuide = {
  title: string;
  sellerCenterHref?: string;
  sellerCenterLabel?: string;
  steps: { title: string; body: ReactNode }[];
  notes?: string[];
};

/** 오른쪽 안내 패널용 — 기존 폼 CollapsibleGuide 내용을 기준으로 정리 */
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
        title: 'OpenAPI 접속',
        body: '11번가 OpenAPI 사이트에서 판매자 API를 신청·발급합니다.',
      },
      {
        title: '엑클로드 정보',
        body: '필요 시 엑클로드 URL·IP를 등록합니다.',
      },
      {
        title: '키 입력',
        body: '발급된 값을 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
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
        title: '앱 등록',
        body: '카페24 Developers에서 앱을 등록하고 OAuth 연동을 준비합니다.',
      },
      {
        title: 'Redirect URI · Scope',
        body: (
          <>
            Redirect URI에{' '}
            <strong>https://www.excload.com/api/order/integration/cafe24/callback</strong> 를
            등록하고, Scope에 <strong>mall.read_order</strong> 를 포함합니다.
          </>
        ),
      },
      {
        title: '키 입력·연동 시작',
        body: 'Client ID / Secret과 mallId를 왼쪽에 저장한 뒤 「카페24 연동 시작」으로 권한 동의를 완료합니다.',
      },
    ],
  },
  lotteon: {
    title: '롯데ON 설정 방법',
    sellerCenterHref: 'https://store.lotteon.com',
    sellerCenterLabel: '롯데ON 스토어',
    steps: [
      {
        title: '판매자 센터',
        body: '롯데ON 판매자 센터에서 OpenAPI 키를 발급합니다.',
      },
      {
        title: '엑클로드 정보',
        body: '필요 시 엑클로드 URL·IP를 등록합니다.',
      },
      {
        title: '키 입력·테스트',
        body: '발급 값을 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
    ],
  },
  ssg: {
    title: 'SSG.COM 설정 방법',
    sellerCenterHref: 'https://po.ssgadm.com',
    sellerCenterLabel: 'SSG 파트너 오피스',
    steps: [
      {
        title: '파트너 오피스',
        body: 'SSG 파트너 오피스에서 API 키를 발급합니다.',
      },
      {
        title: 'IP·URL 등록',
        body: '엑클로드 outbound IP와 URL을 등록합니다.',
      },
      {
        title: '키 입력·테스트',
        body: '왼쪽 입력란에 값을 넣고 연결 테스트 후 저장합니다.',
      },
    ],
  },
  cjonstyle: {
    title: 'CJ온스타일 설정 방법',
    sellerCenterHref: 'https://partners.cjonstyle.com/standardApi/apiGuide',
    sellerCenterLabel: 'CJ온스타일 API 가이드',
    steps: [
      {
        title: '표준 API 안내',
        body: '파트너 사이트 표준 API 가이드를 확인합니다.',
      },
      {
        title: '인증 정보',
        body: '벤더 코드·인증키 등을 발급받아 왼쪽 입력란에 입력합니다.',
      },
      {
        title: '테스트 후 저장',
        body: '연결 테스트 성공 후 저장합니다.',
      },
    ],
  },
  shopby: {
    title: '샵바이 설정 방법',
    sellerCenterHref: 'https://workspace-help.nhn-commerce.com/contents/faq/server-api-1',
    sellerCenterLabel: '샵바이 Server API 안내',
    steps: [
      {
        title: 'Server API',
        body: 'NHN커머스/샵바이 Server API 키를 발급합니다.',
      },
      {
        title: '키 입력',
        body: '발급 값을 왼쪽 입력란에 넣고 연결 테스트 후 저장합니다.',
      },
    ],
  },
  godomall: {
    title: '고도몰 설정 방법',
    sellerCenterHref: 'https://devcenter.godo.co.kr',
    sellerCenterLabel: '고도몰 개발자센터',
    steps: [
      {
        title: '개발자센터',
        body: '고도몰 개발자센터에서 partner_key·user_key를 발급합니다.',
      },
      {
        title: '키 입력·테스트',
        body: '왼쪽 입력란에 값을 넣고 연결 테스트 후 저장합니다.',
      },
    ],
  },
  makeshop: {
    title: '메이크샵 설정 방법',
    sellerCenterHref: 'https://developer.makeshop.co.kr',
    sellerCenterLabel: '메이크샵 Developers',
    steps: [
      {
        title: 'APP API',
        body: '메이크샵 Developers에서 APP API 연동 정보를 확인합니다.',
      },
      {
        title: '도메인·키 등록',
        body: 'shop_domain·shop_key 등을 왼쪽 입력란에 넣고 테스트 후 저장합니다.',
      },
    ],
  },
};
