# 카카오톡스토어 Open API 연동 검토 요청

> **상태**: 문의 전 준비 문서 — 실제 연동·구현 완료 아님  
> **SSOT**: `channelCode: kakao_talkstore`, `phase: partnership_required`, `marketplaceGroupId: kakao_talkstore`  
> **공식 참고**: [카카오쇼핑 Open API 안내](https://shopping-developers.kakao.com/hc/ko/articles/4681097907087), [연동 검토 요청](https://shopping-developers.kakao.com/hc/ko/articles/6592335927183)

---

## 1. 엑클로드 서비스 소개

엑클로드(https://www.excload.com)는 온라인 판매자의 주문 데이터를 표준화하고, 택배사 송장·변환 작업에 맞춰 주문을 정리하는 서비스입니다.

| 항목 | 내용 |
|------|------|
| 서비스 URL | https://www.excload.com |
| 운영 Outbound IP | `54.180.45.46` (고정 IP) |
| 연동 방식 | direct_api (연동대행사 + 판매자 API 키) |

---

## 2. 연동 목적

카카오톡스토어(카카오쇼핑) 판매 채널의 **주문 데이터를 직접 조회·수집**하고, 엑클로드 표준 주문파일로 변환·미리보기하려 합니다.

- 모든 판매자/솔루션사에 API가 개방되어 있지 않음
- **연동대행사 선정·계약** 후 진행 필요로 이해

---

## 3. 1차 연동 범위 (포함)

| 기능 | 내용 |
|------|------|
| 연결 테스트 | OAuth·판매자 API 키로 최소 주문 조회 |
| 주문 조회/수집 | 카카오쇼핑 Open API 주문 조회 |
| 표준 변환/미리보기 | 수집 주문을 엑클로드 OrderStandardFile로 매핑 후 미리보기 |

---

## 4. 제외 범위 (1차에서 하지 않음)

- 발주확인
- 송장전송
- 주문 상태변경
- Webhook
- 상품 등록/수정

---

## 5. 기술 전제 (현재 이해 — 확인 필요)

| 항목 | 내용 |
|------|------|
| 연동대행사 | 엑클로드가 연동대행사로 등록·선정 필요 |
| 인증 | 연동대행사 REST/Admin Key + 판매자 API 인증키 |
| OAuth | `kauth.kakao.com` |
| API | `kapi.kakao.com` |
| 판매자 연결 | `POST /v1/store/register` 선행 필요 |
| 테스트 환경 | **별도 테스트 환경 없음** (운영+테스트 판매자 입점) |
| 판매자당 연동대행사 | 최대 3개 (공식 안내) |

---

## 6. 확인 질문 목록

1. **엑클로드가 카카오쇼핑 연동대행사로 등록 가능한지** 여부와 조건은?
2. **연동대행사 계약 절차** (검토 신청서 → 검토·계약 → 키 발급) 상세 일정은?
3. **판매자 API 인증키 구조** — 연동대행사 앱 REST Key + 판매자센터 API 인증키 조합이 맞는지?
4. **`POST /v1/store/register`** 절차와 판매자·대행사 연결 시 주의사항은?
5. **테스트 판매자·테스트 스토어** 제공 또는 입점 가이드가 있는지?
6. API 호출 시 **고정 IP 등록**이 필요한지? (`54.180.45.46`)
7. **주문 조회 API**만 1차 사용 시 허용 범위는?
8. **심사 기간, 계약 비용, 이용 요금**이 있는지?

---

## 7. 연동 검토 신청 참고 (초안)

공식 절차 (확인 필요):

1. [카카오쇼핑 API 연동 검토 신청서](https://shopping-developers.kakao.com/hc/ko/articles/6592335927183) 제출
2. 검토·계약
3. 카카오 Developers 앱 등록 (연동대행사 계정)
4. 판매자 계정 + `POST /v1/store/register`
5. 판매자센터 API 인증키 확인

신청 시 포함할 정보 (placeholder):

| 항목 | 내용 |
|------|------|
| 업체명 | 엑클로드 |
| 서비스 URL | https://www.excload.com |
| Outbound IP | 54.180.45.46 |
| 1차 범위 | 주문 조회/수집 + 표준 변환 (발송·상품 제외) |
| 연동 채널 | 카카오톡스토어 |

---

## 8. 구현 착수 전 체크리스트

| # | 항목 | 상태 |
|---|------|------|
| 1 | 연동 검토 신청서 제출 | ☐ |
| 2 | 연동대행사 선정·계약 완료 | ☐ |
| 3 | 카카오 Developers 앱·REST/Admin Key 확보 | ☐ |
| 4 | `POST /v1/store/register` 절차 확인 | ☐ |
| 5 | 테스트 판매자 입점·API 인증키 확보 | ☐ |
| 6 | 고정 IP 등록 필요 여부 확인 | ☐ |
| 7 | 주문 조회 API 연결 테스트 성공 | ☐ |
| 8 | Lightsail `kapi.kakao.com`·`kauth.kakao.com` 반영 **승인** | ☐ |
| 9 | Prisma `KAKAO_TALKSTORE` enum 추가 **승인** | ☐ |

**연동대행사 계약·승인 전 코드 구현 착수 금지** (SSOT 정책).

---

## 9. 미작업 주의사항

| 작업 | 상태 |
|------|------|
| 카카오 API client / API route | **미구현** |
| Prisma / migration | **미구현** |
| Lightsail allowed-hosts | **미반영** |
| Production 접속 | **미실행** |

이 문서는 **외부 문의·검토 요청**용이며, 연동 완료를 의미하지 않습니다.
