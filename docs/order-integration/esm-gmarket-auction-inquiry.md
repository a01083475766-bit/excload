# G마켓/옥션 ESM 셀링툴 연동 검토 요청

> **상태**: 문의 전 준비 문서 — 실제 연동·구현 완료 아님  
> **SSOT**: `channelCode: gmarket`, `phase: partnership_required`, `marketplaceGroupId: gmarket`  
> **공식 참고**: [ESM API 가이드](https://etapi.gmarket.com/pages/API-%EA%B0%80%EC%9D%B4%EB%93%9C), [ESM API 포털](https://etapi.gmarket.com/)

---

## 1. 엑클로드 서비스 소개

엑클로드(https://www.excload.com)는 온라인 판매자의 주문 데이터를 표준화하고, 택배사 송장·변환 작업에 맞춰 주문을 정리하는 서비스입니다.

| 항목 | 내용 |
|------|------|
| 서비스 URL | https://www.excload.com |
| 운영 Outbound IP | `54.180.45.46` (고정 IP) |
| 연동 방식 | direct_api (ESM 셀링툴 등록 후 JWT 연동) |

---

## 2. 연동 목적

G마켓·옥션을 **ESM 1채널**로 묶어 주문을 직접 조회·수집하고, 엑클로드 표준 주문파일로 변환·미리보기하려 합니다.

- `auction` 별도 channelCode 없이 **`gmarket` 그룹 1채널**로 관리 예정
- ESM Trading API(`sa2.esmplus.com`) 기준
- 셀링툴 업체로 등록·승인 후 구현 착수 예정

---

## 3. 1차 연동 범위 (포함)

| 기능 | 내용 |
|------|------|
| 연결 테스트 | JWT 인증 후 최소 주문 조회로 연결 확인 |
| 주문 조회/수집 | 주문상태조회·신규주문 목록 등 **조회 API만** |
| 표준 변환/미리보기 | 수집 주문을 엑클로드 OrderStandardFile로 매핑 후 미리보기 |

---

## 4. 제외 범위 (1차에서 하지 않음)

- 발송처리 (`발송처리 API` 등)
- 송장전송
- 클레임 처리 (반품·교환·취소 Mutation)
- 상품 등록/수정
- Webhook

---

## 5. 기술 전제 (현재 이해 — 확인 필요)

| 항목 | 내용 |
|------|------|
| API 문서 | https://etapi.gmarket.com/ (공개) |
| 인증 | JWT(HS256), `kid` = ESM+ Master ID |
| 셀링툴 등록 | `etapihelp@gmail.com` 신청 메일 |
| upstream host (예정) | `sa2.esmplus.com` |
| 판매자 설정 | ESM+ → 셀링툴 관리에서 엑클로드 지정 필요로 이해 |

---

## 6. 확인 질문 목록

1. **엑클로드가 ESM 셀링툴 업체로 등록 가능한지** 여부와 조건은?
2. **등록 신청 절차**와 필요 서류(사업자 정보, 서비스 URL, 매출 규모, 개발 기간 등)는?
3. **테스트 계정·샘플 API** 사용이 가능한지?
4. **JWT 인증 방식**과 Master ID·Secret Key 발급·`ssi`(G/A 판매자 ID) 구조를 확인하고 싶습니다.
5. 판매자가 **ESM+에서 엑클로드를 셀링툴로 선택**해야 하는 구조가 맞는지?
6. **주문 조회 API**만 1차 사용 시 허용되는 API 범위는? (주문상태조회, 목록 조회 등)
7. API 호출 시 **고정 IP 등록**이 필요한지? 필요하면 `54.180.45.46` 등록 절차는?
8. **이용 비용, 심사 기간, 승인 기준**은?

---

## 7. 셀링툴 등록 신청 시 참고 정보 (초안)

공식 가이드에 따른 신청 메일 초안 항목:

| 항목 | 내용 (placeholder) |
|------|-------------------|
| 개발 API 범위 | 주문/클레임 **조회** (1차), 발송·상품 수정 제외 |
| ESM 마스터 ID | (승인 후 발급) |
| 서비스 URL | https://www.excload.com |
| 최근 3개월 매출 규모 | (엑클로드 사업자 기준 작성) |
| API 개발 기간 | (예정 기간) |
| 셀링툴 소개 | 엑클로드 주문 수집·표준화 서비스 |

문의 메일: `etapihelp@gmail.com`

---

## 8. 구현 착수 전 체크리스트

| # | 항목 | 상태 |
|---|------|------|
| 1 | ESM 셀링툴 등록 가능 여부 회신 | ☐ |
| 2 | `etapihelp@gmail.com` 신청서 제출 | ☐ |
| 3 | 셀링툴 승인·Master ID·Secret Key 확보 | ☐ |
| 4 | JWT 인증·주문조회 API 범위 확정 | ☐ |
| 5 | 고정 IP 등록 필요 여부 확인 | ☐ |
| 6 | 테스트 판매자 계정으로 연결 테스트 성공 | ☐ |
| 7 | Lightsail `sa2.esmplus.com` 반영 **승인** | ☐ |
| 8 | Prisma `GMARKET` 또는 기존 `gmarket` provider 확장 **승인** | ☐ |
| 9 | SSOT `phase` → `planned`/`beta` 전환 **승인** | ☐ |

**셀링툴 승인 전 코드 구현 착수 금지** (SSOT 정책).

---

## 9. 미작업 주의사항

| 작업 | 상태 |
|------|------|
| ESM API client / API route | **미구현** |
| Prisma / migration | **미구현** |
| Lightsail allowed-hosts (`sa2.esmplus.com`) | **미반영** |
| Production 접속 | **미실행** |

이 문서는 **외부 문의·검토 요청**용이며, 연동 완료를 의미하지 않습니다.
