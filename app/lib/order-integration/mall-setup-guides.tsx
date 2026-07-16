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
        body: '쿠팡 Wing 판매자센터 → Open API 메뉴로 이동합니다.',
      },
      {
        title: '엑클로드 정보 등록',
        body: '업체명·URL·IP에 왼쪽(또는 상단)의 엑클로드 정보를 등록합니다.',
      },
      {
        title: '키 발급',
        body: 'Access Key, Secret Key를 발급받아 왼쪽 입력란에 붙여넣습니다.',
      },
      {
        title: '테스트 후 저장',
        body: '연결 테스트가 성공하면 저장합니다. 만료일을 넣으면 갱신 관리에 도움이 됩니다.',
      },
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
            <strong>커머스API센터</strong>에 로그인합니다. 스마트스토어센터에서 시작해도 커머스API센터로
            이동하며, 해당 스토어의 <strong>통합매니저 권한</strong>이 필요합니다.
          </>
        ),
      },
      {
        title: '내 스토어 애플리케이션 등록',
        body: (
          <>
            [애플리케이션 &gt; 내스토어 애플리케이션]에서 앱을 등록하고, 사용할{' '}
            <strong>API(주문 관련 권한 포함)</strong>를 선택합니다. 스토어당 최대 3개까지 등록할 수
            있습니다.
          </>
        ),
      },
      {
        title: 'API 호출 IP 등록',
        body: '왼쪽 엑클로드 정보의 outbound IP를 애플리케이션의 API 호출 IP에 추가합니다.',
      },
      {
        title: 'Client ID / Secret 입력',
        body: (
          <>
            발급된 <strong>애플리케이션 ID(Client ID)</strong>와 <strong>시크릿(Client Secret)</strong>을
            왼쪽 입력란에 넣고 연결 테스트 후 저장합니다. type은 기본 <strong>SELF</strong>입니다.
          </>
        ),
      },
    ],
    notes: [
      '이 방식은 판매자 본인이 발급하는 「내 스토어 애플리케이션」입니다. 커머스솔루션마켓(솔루션 구독) 방식과 다릅니다.',
      '서비스 URL·Redirect URI는 입력하지 않습니다.',
      '인증 전자서명·토큰 발급은 엑클로드가 자동으로 처리합니다.',
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
