# 남은 쇼핑몰 주문연동 로드맵

> **상태**: SSOT·UI·설계 문서 (2026-07)  
> **다음 실제 구현 후보**: **Shopify**  
> **금지**: Shopify OAuth/client·Prisma `SHOPIFY`·Lightsail `*.myshopify.com`·Production 접속은 **별도 승인·착수 지시 후**

---

## 바로 API 진행 후보 (app_setup_required)

| channelCode | 이름 | phase | integrationType | 메모 |
|-------------|------|-------|-----------------|------|
| `shopify` | 쇼피파이 | `planned` | `direct_api` | 제휴 승인 불필요. Partners 앱·OAuth·테스트 스토어 준비 후 구현 |

### Shopify 착수 전 필수

1. Shopify Partners Dev Dashboard 앱 등록  
2. OAuth scope: `read_orders` (필요 시 `read_all_orders` 별도 승인)  
3. 테스트 스토어  
4. (승인 후) Lightsail suffix `myshopify.com`, Prisma enum — **아직 미반영**

헬퍼: `getNextApiDirectCandidates()` / `getPlannedDirectApiChannels()` → Shopify만.

---

## 문의/승인 필요 후보

구현·연동 설정 **불가**. 회신·승인 후 재분류.

| channelCode | phase | 문의 초점 | 문서 |
|-------------|-------|-----------|------|
| `zigzag` | `partnership_required` | MD 문의 (헤더·키) | [zigzag-md-inquiry.md](./zigzag-md-inquiry.md) |
| `gmarket` | `partnership_required` | ESM 셀링툴 | [esm-gmarket-auction-inquiry.md](./esm-gmarket-auction-inquiry.md) |
| `kakao_talkstore` | `partnership_required` | 연동대행사·계약 | [kakao-talkstore-inquiry.md](./kakao-talkstore-inquiry.md) |
| `tenbyten` | `partnership_required` | SCM/API 문의 | — |
| `domeggook` | `partnership_required` | Private API + 비밀번호 세션 | — |
| `qoo10` | `research_required` | QAPI·연동회사 신청 | — |
| `musinsa` | `partnership_required` | API 대행사 등록 | — |
| `ably` | `partnership_required` | Sellers API host/문서 | — |

헬퍼: `getInquiryApprovalDirectChannels()` / `getInquiryApprovalDirectChannelsForUi()`.

진행 현황: [external-inquiry-status.md](./external-inquiry-status.md)

---

## hub 우선 후보 (channelCode는 로드맵 라벨)

공개 판매자 API Docs 부재 또는 **지원 솔루션만** 키 발급. Direct 메인 후보 아님.

| code | 이름 | kind |
|------|------|------|
| todayhouse | 오늘의집 | hub_only |
| brandi | 브랜디 | hub_only |
| hiver | 하이버 | hub_only |
| ballan | 발란 | hub_only |
| buyzzle | 바이즐 | hub_only |

엑클로드 `hub_api` 우선 검토: `playauto` · `sabangnet` · `easyadmin` (별도 SSOT).

---

## excel_upload_first 후보

공식 주문 API 공개 근거 없음 → 엑셀 템플릿 대응 우선. **direct_api로 오인 금지**.

| code | 이름 |
|------|------|
| hottracks | 핫트랙스 |
| babosarang | 바보사랑 |
| 1300k | 1300K |
| goldii | 골디 |

상수: `HUB_OR_EXCEL_PRIORITY_ROADMAP` (hub + excel 합본).  
connect 페이지 미노출 — [connect-page-preparing-and-candidates.md](./connect-page-preparing-and-candidates.md)

---

## blocked_or_closed 후보

| code | 이름 | SSOT |
|------|------|------|
| tmon | 티몬 | `excel_tmon` (엑셀 플레이스홀더) |
| wemakeprice | 위메프 | `excel_wemakeprice` |

정상 영업·공식 API 재개 전 **direct live 목록·UI 미노출**.  
상수: `BLOCKED_OR_CLOSED_ROADMAP`.

---

## 운영 중 direct (변경 없음)

`getLiveDirectApiChannels()` = live/beta **10채널만**:

coupang, smartstore, eleven, cafe24, lotteon, ssg, cjonstyle, godomall, shopby, makeshop  

UI 클릭 가능 = `ORDER_INTEGRATION_MALLS`의 `available`만.  
준비중·후보 목록은 connect 페이지 미노출 — [connect-page-preparing-and-candidates.md](./connect-page-preparing-and-candidates.md)

---

## 다음 액션 요약

1. **구현 트랙**: Shopify 설계·Partners 준비 (코드는 별도 승인 후)  
2. **문의 트랙**: zigzag / ESM / kakao 회신 대기 + tenbyten·musinsa 등 문의 초안  
3. **허브/엑셀**: 수요 확인 후 템플릿·hub 검토  
4. **티몬/위메프**: 무기한 보류  
