# 쿠팡 API 고정 IP 프록시 — 계약 및 참조 구현

> 상태: Vercel 앱 측 transport 분리 완료. 프록시 서버는 Lightsail/EC2 등에 별도 배포.

## 호출 흐름

```text
관리자 UI
  → Vercel /api/order/integration/coupang/*
  → app/lib/coupang/client.ts (coupangApiRequest)
  → resolveCoupangTransport()
       ├─ direct  : Vercel → api-gateway.coupang.com (관리자 테스트·개발용)
       └─ proxy   : Vercel → COUPANG_PROXY_BASE_URL/internal/coupang/invoke
                    → 프록시(고정 IP) → api-gateway.coupang.com
```

## 환경변수 (Vercel)

| 변수 | 필수 | 설명 |
|------|------|------|
| `COUPANG_PROXY_BASE_URL` | proxy 모드 시 | 예: `https://coupang-proxy.excload.internal` |
| `COUPANG_PROXY_SHARED_SECRET` | proxy 모드 시 | Vercel↔프록시 HMAC 공유 비밀 |
| `COUPANG_PROXY_KEY_ID` | 선택 | 기본값 `default` |
| `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP` | UI 표시용 | **프록시 모드에서는 프록시 서버의 고정 IP**를 안내 |

proxy 모드 활성 조건: `COUPANG_PROXY_BASE_URL` **와** `COUPANG_PROXY_SHARED_SECRET` 모두 설정.

## 프록시 엔드포인트

### `POST /internal/coupang/invoke`

#### 요청 헤더 (Vercel → 프록시)

| 헤더 | 설명 |
|------|------|
| `x-excload-proxy-timestamp` | ISO 8601 UTC 시각 |
| `x-excload-proxy-signature` | HMAC-SHA256 hex |
| `x-excload-proxy-request-id` | UUID (재전송 추적용) |
| `x-excload-proxy-key-id` | 키 식별자 |

#### 서명 메시지

```text
{timestamp}{METHOD}{path}{sha256(body)}
```

- `path`: `/internal/coupang/invoke` (쿼리스트링 없음)
- `METHOD`: `POST`
- 타임스탬프 허용 오차: ±5분

#### 요청 본문 (JSON)

```json
{
  "method": "GET",
  "pathWithQuery": "/v2/providers/openapi/apis/api/v5/vendors/A00012345/ordersheets?status=ACCEPT",
  "vendorId": "A00012345",
  "accessKey": "...",
  "secretKey": "...",
  "body": null
}
```

> 초기 설계: Vercel에서 DB 복호화 후 프록시로 전달. HTTPS + HMAC 필수.  
> 프록시 로그에 Access Key / Secret Key / Coupang Authorization 기록 금지.

#### 응답 (JSON)

성공:

```json
{
  "ok": true,
  "httpStatus": 200,
  "bodyText": "{ \"code\": 200, \"message\": \"OK\", \"data\": [] }"
}
```

실패:

```json
{
  "ok": false,
  "httpStatus": 403,
  "bodyText": "...",
  "error": "optional summary"
}
```

`bodyText`는 쿠팡 API 원문 응답 문자열 그대로. Vercel `client.ts`가 기존과 동일하게 파싱.

## 쿠팡 WING IP 등록

| 모드 | WING에 등록할 IP |
|------|------------------|
| direct (Vercel) | Vercel egress IP (Static IP 미사용 시 비권장) |
| proxy | **프록시 서버 Elastic IP / Lightsail Static IP** |

UI의 `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP`는 운영 안내용으로, 프록시 전환 시 프록시 IP로 변경.

## Vercel 코드 위치

```text
app/lib/coupang/
  transport/
    types.ts
    config.ts
    direct-transport.ts
    proxy-transport.ts
    resolve-transport.ts
  proxy-signing.ts
  client.ts                 # transport 경유 단일 진입점
```

관리자 transport 확인 API: `GET /api/order/integration/coupang/transport`

## 참조 프록시 서버

`services/coupang-proxy/` — Lightsail/EC2 배포용 최소 Node.js 참조 구현.

**배포 절차 (초보자용):** [`docs/coupang-proxy-lightsail-ec2-deploy.md`](./coupang-proxy-lightsail-ec2-deploy.md)

배포 후 Vercel에:

```env
COUPANG_PROXY_BASE_URL=https://<proxy-host>
COUPANG_PROXY_SHARED_SECRET=<same-as-proxy-env>
NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP=<proxy-elastic-ip>
```

## 보류 (의도적으로 미구현)

- 일반 사용자 공개
- 프록시 requestId 영구 저장(재전송 차단) — 프록시 서버 구현 시 Redis/메모리 TTL 권장
- Vercel Static IP ($100/월) 사용
