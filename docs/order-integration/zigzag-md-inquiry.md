# 지그재그 Open API 연동 검토 요청 (MD 문의용)

> **상태**: 문의 전 준비 문서 — 실제 연동·구현 완료 아님  
> **SSOT**: `channelCode: zigzag`, `phase: partnership_required`, `marketplaceGroupId: zigzag`  
> **공식 참고**: [카카오스타일 Open API 기본 정보](https://zigzag.kr/_openapi/docs/), [GraphQL 스키마](https://zigzag.kr/_openapi/openapi.graphql)

---

## 1. 엑클로드 서비스 소개

엑클로드(https://www.excload.com)는 온라인 판매자의 주문 데이터를 표준화하고, 택배사 송장·변환 작업에 맞춰 주문을 정리하는 서비스입니다.

| 항목 | 내용 |
|------|------|
| 서비스 URL | https://www.excload.com |
| 운영 Outbound IP | `54.180.45.46` (고정 IP) |
| 연동 방식 | direct_api (판매자 API 키 기반 직접 조회) |

---

## 2. 연동 목적

카카오스타일 파트너센터 Open API를 통해 **지그재그 판매 스토어의 주문 데이터를 직접 조회·수집**하고, 엑클로드 표준 주문파일(OrderStandardFile)로 변환·미리보기하는 것이 1차 목표입니다.

- 상품 등록·배송 처리 대행이 **아님**
- 판매자용 **주문 수집·정리** 용도

---

## 3. 1차 연동 범위 (포함)

| 기능 | 내용 |
|------|------|
| 연결 테스트 | API 인증 후 `hello` 등 최소 호출로 연결 확인 |
| 주문 조회/수집 | `order_item_list` 기준 기간·상태별 조회 |
| 표준 변환/미리보기 | 수집 주문을 엑클로드 OrderStandardFile로 매핑 후 미리보기 |

---

## 4. 제외 범위 (1차에서 하지 않음)

- 발주확인 (`markOrderItemListAsAwaitingShipment` 등)
- 송장전송 (`updateInvoiceOfOrderItemList` 등)
- 주문 상태변경 Mutation 전반
- Webhook
- 상품 등록/수정

---

## 5. 기술 전제 (현재 이해 — 확인 필요)

| 항목 | 내용 |
|------|------|
| API 형태 | GraphQL Open API |
| 인증 | 파트너센터 Access Key + Secret Key |
| 스키마 | https://zigzag.kr/_openapi/openapi.graphql |
| 권한 | `ShopAuthScope.GET_ORDER` 기준 주문 조회 예상 |
| 최초 연동 | 공식 안내: 담당 MD에게 연락 |

---

## 6. 확인 질문 목록

1. Access Key / Secret Key를 넣을 **정확한 HTTP 헤더명**은 무엇인가요?
2. 솔루션 연동용 **`x-solution` 헤더**가 엑클로드 같은 외부 서비스에도 필요한가요? 필요하면 값은 어떻게 정하나요?
3. **`GET_ORDER` 권한만으로 `order_item_list` 조회가 가능**한가요? 추가 scope가 있나요?
4. API 호출 시 **고정 IP 등록**이 필요한가요? 필요하면 등록 절차는?
5. **테스트 스토어·샘플 계정** 제공이 가능한가요?
6. GraphQL endpoint가 **`https://zigzag.kr/_openapi/openapi.graphql`** 가 맞나요?
7. 주문조회 시 **권장 `status` / date 조건**이 있나요? (예: `NEW_ORDER`, `AWAITING_SHIPMENT` + 결제일 vs 주문생성일)
8. **직진배송(`zigzin_order_item_list`)은 1차에서 제외**해도 무방한가요?

---

## 7. hello 테스트용 curl 초안

> **실행 금지** — 헤더명·키 값은 placeholder입니다.

```bash
curl -X POST "https://zigzag.kr/_openapi/openapi.graphql" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "{{ACCESS_KEY_HEADER_NAME}}: {{ACCESS_KEY}}" \
  -H "{{SECRET_KEY_HEADER_NAME}}: {{SECRET_KEY}}" \
  --data-raw '{
    "query": "query { hello { message } }"
  }'
```

`x-solution`이 필요하다고 회신되면 추가:

```bash
# -H "x-solution: excload"
```

---

## 8. order_item_list GraphQL Query 초안

> **실행 금지** — hello와 동일 placeholder 사용.

```graphql
query FetchOrderItems(
  $dateYmdFrom: Int!
  $dateYmdTo: Int!
  $status: OrderItemStatus
  $limitCount: Int
  $skipCount: Int
) {
  order_item_list(
    date_ymd_from: $dateYmdFrom
    date_ymd_to: $dateYmdTo
    status: $status
    limit_count: $limitCount
    skip_count: $skipCount
  ) {
    total_count
    item_list {
      order_item_number
      quantity
      status
      total_amount
      order {
        order_number
        date_created
        date_paid
        shipping_memo
      }
      order_item_receiver {
        name
        contract_number
        postcode
        address
        detail_address
      }
      order_item_product {
        kr_name
        kr_options
      }
    }
  }
}
```

variables 예시:

```json
{
  "dateYmdFrom": 20260701,
  "dateYmdTo": 20260708,
  "status": "AWAITING_SHIPMENT",
  "limitCount": 50,
  "skipCount": 0
}
```

curl 래핑 초안:

```bash
curl -X POST "https://zigzag.kr/_openapi/openapi.graphql" \
  -H "Content-Type: application/json" \
  -H "{{ACCESS_KEY_HEADER_NAME}}: {{ACCESS_KEY}}" \
  -H "{{SECRET_KEY_HEADER_NAME}}: {{SECRET_KEY}}" \
  --data-raw '{
    "query": "query FetchOrderItems($dateYmdFrom: Int!, $dateYmdTo: Int!, $status: OrderItemStatus, $limitCount: Int, $skipCount: Int) { order_item_list(date_ymd_from: $dateYmdFrom, date_ymd_to: $dateYmdTo, status: $status, limit_count: $limitCount, skip_count: $skipCount) { total_count item_list { order_item_number quantity status total_amount order { order_number date_created date_paid shipping_memo } order_item_receiver { name contract_number postcode address detail_address } order_item_product { kr_name kr_options } } } }",
    "variables": {
      "dateYmdFrom": 20260701,
      "dateYmdTo": 20260708,
      "status": "AWAITING_SHIPMENT",
      "limitCount": 50,
      "skipCount": 0
    }
  }'
```

---

## 9. 구현 착수 전 체크리스트

| # | 항목 | 상태 |
|---|------|------|
| 1 | MD 문의 완료 (회신 수령) | ☐ |
| 2 | 인증 헤더명 확정 | ☐ |
| 3 | `x-solution` 필요 여부 확정 | ☐ |
| 4 | `GET_ORDER`로 `order_item_list` 가능 확인 | ☐ |
| 5 | 고정 IP 등록 필요 여부 확인 | ☐ |
| 6 | 테스트 Access/Secret Key 확보 | ☐ |
| 7 | `hello` 테스트 성공 | ☐ |
| 8 | Lightsail `zigzag.kr` 반영 **승인** | ☐ |
| 9 | Prisma `ZIGZAG` enum 추가 **승인** | ☐ |

**권장 순서**: 1→2→3→4→5→6→7 완료 후, 8·9 승인 받은 뒤 코드 구현 착수.

---

## 10. 미작업 주의사항

| 작업 | 상태 |
|------|------|
| API client / API route | **미구현** |
| Prisma / migration | **미구현** |
| Lightsail allowed-hosts | **미반영** |
| Production 접속·curl 실호출 | **미실행** |

이 문서는 **외부 문의·검토 요청**용이며, 연동 완료를 의미하지 않습니다.
