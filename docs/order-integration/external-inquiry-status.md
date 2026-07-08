# 주문연동 외부 문의 진행 현황

> **목적**: partnership_required / planned 채널의 외부 문의·승인 진행 상태 관리  
> **갱신**: 문의 발송·회신 시 이 표를 수동 업데이트

---

## 진행 현황표

| 채널 | 현재 상태 | 문의 대상 | 문의 전 준비 완료 | 문의 발송 | 회신 | 다음 액션 |
|------|----------|----------|------------------|----------|------|----------|
| **지그재그** | 문의자료 준비 | 카카오스타일 담당 MD | ✅ | ☐ | ☐ | MD 문의 발송 → 헤더명·테스트 키 확정 |
| **G마켓/옥션 (ESM)** | 문의자료 준비 | ESM API (`etapihelp@gmail.com`) | ✅ | ☐ | ☐ | 셀링툴 등록 신청 → 승인 대기 |
| **카카오톡스토어** | 문의자료 준비 | 카카오쇼핑 Open API | ✅ | ☐ | ☐ | 연동 검토 신청서 제출 → 계약 검토 |

---

## 채널별 문서 링크

| 채널 | 문의 자료 |
|------|----------|
| 지그재그 | [zigzag-md-inquiry.md](./zigzag-md-inquiry.md) |
| G마켓/옥션 ESM | [esm-gmarket-auction-inquiry.md](./esm-gmarket-auction-inquiry.md) |
| 카카오톡스토어 | [kakao-talkstore-inquiry.md](./kakao-talkstore-inquiry.md) |

---

## SSOT 참고 (레포 기준, 구현 아님)

| channelCode | phase | marketplaceGroupId |
|-------------|-------|-------------------|
| `zigzag` | `planned` | `zigzag` |
| `gmarket` | `partnership_required` | `gmarket` |
| `kakao_talkstore` | `partnership_required` | `kakao_talkstore` |

---

## 공통 문의 전 체크리스트

| # | 항목 | 지그재그 | ESM | 카카오톡스토어 |
|---|------|---------|-----|---------------|
| 1 | 문의 자료 Markdown 작성 | ✅ | ✅ | ✅ |
| 2 | 1차 범위·제외 범위 명시 | ✅ | ✅ | ✅ |
| 3 | 확인 질문 목록 정리 | ✅ | ✅ | ✅ |
| 4 | placeholder만 사용 (실제 키 없음) | ✅ | ✅ | ✅ |
| 5 | 문의 발송 | ☐ | ☐ | ☐ |
| 6 | 회신 수령 | ☐ | ☐ | ☐ |
| 7 | 구현 착수 승인 (별도) | ☐ | ☐ | ☐ |

---

## 상태 정의

| 상태 | 의미 |
|------|------|
| 문의자료 준비 | repo 문서 작성 완료, 발송 전 |
| 문의 발송 | 외부에 메일·신청서 전달 |
| 회신 대기 | 답변·승인 결과 대기 |
| 회신 완료 | 확인 질문에 대한 답변 수령 |
| 구현 착수 가능 | 회신 + 내부 승인(Lightsail·Prisma) 완료 |

---

## 미작업 주의 (공통)

- API client / API route: **미구현**
- Prisma / migration: **미구현**
- Lightsail allowed-hosts: **미반영**
- Production 접속: **미실행**

이 표는 **진행 관리용**이며, 연동 완료 상태를 나타내지 않습니다.
