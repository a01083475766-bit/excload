# 연동 설정 페이지 — 준비중·후보 채널 (내부 보관)

> **노출**: `/order/integration/connect` **페이지에는 표시하지 않음** (2026-07).  
> **목적**: 준비중 몰·추가 채널 안내를 UI에서 빼고, 내부 참고용으로만 보관.  
> **SSOT(코드)**: `app/lib/order-integration/mall-integration-specs.ts`, `malls.ts`  
> **로드맵**: [remaining-malls-roadmap.md](./remaining-malls-roadmap.md) · [external-inquiry-status.md](./external-inquiry-status.md)

---

## 준비중 (ORDER_INTEGRATION_MALLS · preparing)

| id | 이름 | 표시 문구 |
|----|------|-----------|
| `gmarket` | G마켓/옥션 | 제휴 준비 중 |

- ESM 제휴 승인 전까지 연동 설정 불가.
- 문의 문서: [esm-gmarket-auction-inquiry.md](./esm-gmarket-auction-inquiry.md)

---

## API 개발 후보

| 채널 | 메모 |
|------|------|
| 쇼피파이 (`shopify`) | Shopify OAuth 앱 등록 후 검토 |

헬퍼: `getNextApiDirectCandidates()`

---

## 문의·승인 필요

헬퍼: `getInquiryApprovalDirectChannelsForUi()` / `INQUIRY_APPROVAL_UI_ORDER`

| 채널 | 판매자·제휴 측 액션 요약 |
|------|-------------------------|
| 지그재그 | 카카오스타일 담당 MD 문의 → Access/Secret Key·인증 헤더명 확정 후 파트너센터 키 발급 |
| G마켓/옥션 (ESM) | ESM+ 셀링툴 등록·`etapihelp@gmail.com` 제휴 승인 → ESM+ 셀링툴 관리에서 엑클로드 지정, JWT(HS256) 연동 |
| 카카오톡스토어 | 카카오쇼핑 API 연동 검토 신청 → 계약 → 연동대행사(엑클로드) 선정·등록 → Developers 앱 + 판매자 API 키 |
| 텐바이텐 | SCM 입점·기술지원(`kobula@10x10.co.kr`) 문의 후 API Key 발급 |
| 도매꾹 | Open API Key + Private API 권한 승인 (주문수집). 로그인 sId·비밀번호 세션 이슈 확인 필요 |
| 큐텐 | QSM 문의·연동회사명 신청 후 Certification Key (QAPI) |
| 무신사 | 파트너센터 API 인증키 + 엑클로드 API 대행사 등록 문의 |
| 에이블리 | Sellers API Token·upstream host/문서 확인 문의 (셀러스 입점만) |

개별 문의 초안: [zigzag-md-inquiry.md](./zigzag-md-inquiry.md), [kakao-talkstore-inquiry.md](./kakao-talkstore-inquiry.md)

---

## 허브·엑셀 우선

상수: `HUB_OR_EXCEL_PRIORITY_ROADMAP`

- 오늘의집, 브랜디, 하이버, 발란, 바이즐
- 핫트랙스, 바보사랑, 1300K, 골디

### hub_api 우선 검토 (SSOT)

헬퍼: `getPriorityHubChannels()`

- 플레이오토 (검토 중)
- 사방넷 (검토 중)
- 이지어드민 (검토 중)

---

## 메모 (구 UI 안내 문구)

관리자·내부용. 메인 연동은 쇼핑몰별 직접 API. G마켓/옥션은 ESM 제휴 승인 전까지 설정할 수 없음.

페이지에 다시 노출할 때는 이 문서와 `remaining-malls-roadmap.md`를 기준으로 최소 안내만 넣을 것.
