export const siteConfig = {
  brandEn: "ONECLOAD",
  brandKo: "원클로드",
};

export const featureOptions = [
  "카톡 주문 자동 정리",
  "여러 쇼핑몰 주문파일 통합",
  "쇼핑몰 주문 한 번에 조회",
  "송장번호 자동 매칭·전송",
  "모두 관심 있음",
] as const;

export const participationOptions = [
  "실제 업무로 베타 테스트해 보고 싶어요",
  "기능이 준비되면 소식만 받고 싶어요",
] as const;

export const orderVolumeOptions = [
  "월 50건 이하",
  "월 51~200건",
  "월 201~500건",
  "월 501~1,000건",
  "월 1,000건 이상",
] as const;

export const priceOptions = [
  "월 4,900원 이하",
  "월 5,000원~9,900원",
  "월 10,000원~19,900원",
  "월 20,000원~29,900원",
  "월 30,000원 이상",
  "무료일 때만 사용할 것 같음",
  "기능을 직접 확인한 뒤 판단하고 싶음",
] as const;
