import type { Metadata } from 'next';

export const SITE_URL = 'https://www.excload.com';

export const DEFAULT_TITLE =
  '엑클로드(EXCLOAD) - 주문 엑셀·송장 파일 자동 변환';

export const DEFAULT_DESCRIPTION =
  '엑클로드(EXCLOAD)는 쇼핑몰 주문 엑셀, 송장 파일, 물류 주문 데이터를 택배사·물류 양식에 맞게 변환해주는 주문/배송 업무 자동화 서비스입니다.';

const OPEN_GRAPH_SITE_NAME = '엑클로드 EXCLOAD';

export function buildOpenGraph(
  title: string,
  description: string,
  pathname: string,
): NonNullable<Metadata['openGraph']> {
  return {
    title,
    description,
    url: `${SITE_URL}${pathname}`,
    siteName: OPEN_GRAPH_SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
  };
}

/** 페이지별 title·description·canonical·openGraph */
export function pageMetadata(
  title: string,
  description: string,
  pathname: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${pathname}` },
    openGraph: buildOpenGraph(title, description, pathname),
  };
}

export const PAGE_SEO = {
  home: pageMetadata(DEFAULT_TITLE, DEFAULT_DESCRIPTION, '/'),
  orderConvert: pageMetadata(
    '택배주문변환 - 쇼핑몰 주문 엑셀 택배사 양식 변환 | 엑클로드',
    '쇼핑몰 주문 엑셀, 텍스트, 이미지를 택배사 업로드 양식에 맞게 정리하고 변환할 수 있습니다. 엑클로드(EXCLOAD) 택배 엑셀 변환 서비스.',
    '/order-convert',
  ),
  logisticsConvert: pageMetadata(
    '물류주문변환 - 3PL·물류센터 양식 주문 변환 | 엑클로드',
    '3PL·물류센터 양식에 맞게 주문 데이터를 변환할 수 있습니다. 엑클로드(EXCLOAD) 물류 주문 변환 서비스.',
    '/logistics-convert',
  ),
  invoiceFileConvert: pageMetadata(
    '송장파일변환 - 택배 송장번호·주문 데이터 정리 | 엑클로드',
    '택배사에서 내려받은 송장번호 파일을 주문 데이터와 맞춰 정리할 수 있습니다. 엑클로드(EXCLOAD) 송장 파일 변환 서비스.',
    '/invoice-file-convert',
  ),
  pricing: pageMetadata(
    '가격 플랜 - 엑클로드(EXCLOAD) 요금 안내',
    '엑클로드(EXCLOAD) 주문 엑셀·송장 파일 변환 서비스의 무료·프로·연간 요금 플랜을 확인하세요.',
    '/pricing',
  ),
  userGuide: pageMetadata(
    '사용가이드 - 엑클로드(EXCLOAD) 주문 변환 이용 안내',
    '택배주문변환, 물류주문변환, 송장파일변환 기능을 단계별로 안내합니다. 엑클로드(EXCLOAD) 사용 가이드.',
    '/user-guide',
  ),
  about: pageMetadata(
    '서비스소개 - 엑클로드(EXCLOAD) 주문·배송 업무 자동화',
    '엑클로드(EXCLOAD)는 쇼핑몰 주문 엑셀, 송장 파일, 물류 주문 데이터를 택배사·물류 양식에 맞게 변환하는 서비스입니다.',
    '/about',
  ),
  contact: pageMetadata(
    '고객문의 - 엑클로드(EXCLOAD)',
    '엑클로드(EXCLOAD) 주문 엑셀 변환, 송장 파일 변환, 물류 주문 변환 서비스에 대한 문의를 남겨주세요.',
    '/contact',
  ),
} as const;
