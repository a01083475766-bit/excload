# 채널 API 접근·인증 매트릭스 (SSOT)

> **문서 목적**: 모든 주문연동 채널의 **기술·계약·인증 상태**를 한눈에 보는 단일 기준(SSOT).
> **작성**: 2026-07-17 · 문서 조사 단계 (코드 미수정)
> **코드 SSOT**: `app/lib/order-integration/mall-integration-specs.ts`, `malls.ts`
> **연관 문서**: [channel-user-setup-guides.md](./channel-user-setup-guides.md) · [channel-api-research-sources.md](./channel-api-research-sources.md) · [remaining-malls-roadmap.md](./remaining-malls-roadmap.md)

---

## 0. 판정 등급 정의

| 최종 판정 | 의미 |
|-----------|------|
| **판매자 직접연결 가능** | 판매자가 자기 계정에서 직접 키를 발급하고 엑클로드에 입력하면 연결. (엑클로드 IP/URL 등록은 정보 제공 수준) |
| **엑클로드 사업자 승인 후 가능** | 엑클로드가 개발사·솔루션사·연동대행사·셀러툴로 별도 등록·심사·계약을 받아야 판매자가 연결 가능 |
| **지정 셀러툴만 가능** | 판매자가 채널 화면의 셀러툴/연동업체 목록에서 엑클로드를 선택해야만 연결 (엑클로드 사전 등록 필수) |
| **공식 확인 필요** | 공식 공개 문서로 인증·발급 방식이 확정되지 않음. 로그인/문의 후 재확인 |
| **현재 직접연동 불가** | 공식 주문 API 부재·중단·엑셀 전용 등으로 direct 연동 대상 아님 |

> **근거 등급**: 확정(공식 공개 문서) / 조건부(공식이나 로그인·계약 전제) / 미확정(제3자 자료만 또는 확인 불가)

---

## 1. 전체 비교표

### 1-A. 운영 중 direct (live·beta 10채널) — connect 페이지 노출

`getLiveDirectApiChannels()` 기준. `ORDER_INTEGRATION_MALLS`의 `available`.

| 채널 | phase | 인증방식 | 판매자 직접 키발급 | 엑클로드 별도승인 | 셀러툴 선택 | 고정 IP | Redirect/Callback | 주문조회 | 송장전송 | 최종 판정 | 근거등급 |
|------|-------|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|-----------|:---:|
| 쿠팡 | live | HMAC + IP | O | X | 선택 | **필수(자체개발)** | 불필요 | O | 1차 제외 | 판매자 직접연결 가능 | 확정 |
| 스마트스토어 | beta | OAuth2(전자서명) + IP | O | X | X | 등록(호출 IP) | 불필요 | O | O(구현범위) | 판매자 직접연결 가능 | 확정 |
| 11번가 | beta | OpenAPI Key(헤더) | O | X | **일부 필요?** | 확인 필요 | 불필요 | O | O(구현범위) | 판매자 직접연결 가능 | 조건부 |
| 카페24 | beta | OAuth2(Authorization Code) | △(현재 판매자 앱) | △(솔루션 앱 시) | X | 불필요 | **필수** | O | O | 판매자 직접연결 가능 | 확정 |
| 롯데ON | beta | API Key(Query) + IP | O | X | 선택 | **필수(IP 또는 셀러툴)** | 불필요 | O | O(구현범위) | 판매자 직접연결 가능 | 확정 |
| SSG.COM | beta | API 인증키(헤더) + IP | O | △(입점·MD 승인) | X | **필수(서버 IP)** | 불필요 | O | O(구현범위) | 판매자 직접연결 가능 | 조건부 |
| CJ온스타일 | beta(restricted) | vendorCode+authKey(헤더) + IP | O | △(입점 협력사) | X | **필수** | 불필요 | O(placeholder) | 1차 제외 | 공식 확인 필요 | 미확정 |
| NHN커머스/샵바이 | beta | systemKey+mallKey(헤더) | O | △(앱 등록) | X | 불필요 | 불필요 | O | O | 판매자 직접연결 가능 | 확정 |
| 고도몰 | beta(restricted) | partner_key+userKey(XML) + IP | △(userKey만) | **O(제휴사 등록)** | X | **필수(문의)** | 불필요 | O | 1차 제외 | 엑클로드 사업자 승인 후 가능 | 조건부 |
| 메이크샵 | beta(restricted) | OAuth2 client_credentials + IP | X(엑클로드 APP) | **O(APP 심사)** | X | **필수** | 불필요 | O | 1차 제외 | 엑클로드 사업자 승인 후 가능 | 확정 |

> 표기: `O`=해당, `X`=비해당, `△`=조건부. "송장전송"은 SSOT `supportedActions`의 `invoice_upload` 유무이며, 현재 1차 구현은 대부분 **주문조회만** 활성.

### 1-B. 예정·문의·승인 필요 direct — connect 페이지 미노출(또는 준비중 배지)

| 채널 | phase | 인증방식 | 최종 판정 | 근거등급 |
|------|-------|----------|-----------|:---:|
| 쇼피파이(Shopify) | planned | OAuth2 | 판매자 직접연결 가능(구현 예정) | 조건부 |
| G마켓/옥션(ESM) | partnership_required | JWT(HS256) | 엑클로드 사업자 승인 후 가능 / 지정 셀러툴 | 조건부 |
| 지그재그 | partnership_required | Access/Secret Key | 공식 확인 필요(MD 문의) | 미확정 |
| 카카오톡스토어 | partnership_required | OAuth + 판매자 API키 | 엑클로드 사업자 승인 후 가능(연동대행사) | 조건부 |
| 텐바이텐 | partnership_required | API Key | 공식 확인 필요(SCM 문의) | 미확정 |
| 도매꾹 | partnership_required | API Key + Private 승인 | 공식 확인 필요 | 미확정 |
| 큐텐 | research_required | Certification Key(QAPI) | 공식 확인 필요 | 미확정 |
| 무신사 | partnership_required | API Key | 엑클로드 사업자 승인 후 가능(대행사 등록) | 미확정 |
| 에이블리 | partnership_required | API Token | 공식 확인 필요(host 미확정) | 미확정 |

### 1-C. hub_api (보조연동) — 메인 수집 경로 아님

| 채널 | hubPriority | 인증방식 | 최종 판정 | 근거등급 |
|------|-------------|----------|-----------|:---:|
| 플레이오토 | priority_hub | API Key | 지정 셀러툴(허브) 사용자만 보조연동 | 미확정(계약·host) |
| 사방넷 | priority_hub | XML API Key | 지정 셀러툴(허브) 사용자만 보조연동 | 조건부 |
| 이지어드민 | priority_hub | API Key | 지정 셀러툴(허브) 사용자만 보조연동 | 미확정 |
| 샵링커·샵플링·셀메이트·셀릭·셀픽·이지위너 | deferred/backlog | API Key | 로드맵 보류(SSOT·충돌정책용) | 미확정 |

### 1-D. excel_upload · 보류·차단

| 채널 | 유형 | 최종 판정 | 비고 |
|------|------|-----------|------|
| 엑셀 업로드(공통) `excel_generic` | excel_upload | 현재 직접연동 불가(엑셀) | 안전망 |
| 티몬 `excel_tmon` | excel_upload | 현재 직접연동 불가 | 정상 영업·API 재개 전 보류 |
| 위메프 `excel_wemakeprice` | excel_upload | 현재 직접연동 불가 | 보류 |
| API 미확정 판매처 `excel_pending` | excel_upload | 현재 직접연동 불가 | 무신사·29CM·토스쇼핑 등 placeholder |
| 오늘의집·브랜디·하이버·발란·바이즐 | hub_only(로드맵) | 공식 확인 필요 | 공개 판매자 API 부재 |
| 핫트랙스·바보사랑·1300K·골디 | excel_upload_first(로드맵) | 현재 직접연동 불가 | 엑셀 우선 |

---

## 2. 채널별 상세 근거 (live·beta 10채널)

각 항목은 과제 20개 조사표(공식 서비스명 → 최종 판정) 순서를 따른다.

### 2-1. 쿠팡 (`coupang`)

1. **공식 서비스명**: 쿠팡 WING / Coupang Open API
2. **공식 문서**: `developers.coupangcorp.com` (Open API), WING 판매자센터
3. **판매자 입점 계정 필요**: O (사업자 인증 필수 — 일반회원 발급 불가)
4. **판매자 직접 키 발급**: O. WING → 판매자정보 → 추가판매정보 → OPEN API 키 발급 → 약관동의 → OPEN API 선택
5. **엑클로드 별도 승인**: 불필요 (연동업체 목록 등록은 선택 사항)
6. **판매자가 엑클로드 선택**: 선택. **연동업체 선택** 또는 **자체개발(직접입력)** 중 **택1**. 엑클로드가 연동업체 목록에 없으면 **자체개발**로 진행
7. **인증 방식**: Access Key / Secret Key + HMAC 서명 + **IP whitelist**
8. **사용자 입력값**: 계정명, 업체코드(vendorId), Access Key, Secret Key
9. **엑클로드가 사용자에게 보여줘야 하는 값**: 업체명(엑클로드), 서비스 URL(https://www.excload.com), **API 호출 고정 IP** — 자체개발 방식일 때 반드시 입력
10. **고정 IP**: **필수(자체개발 방식)**. 자체개발 선택 시 IP 최대 10개 입력. (연동업체 선택 시 IP 입력 불필요)
11. **Redirect/Callback URL**: 불필요
12. **주문조회 API**: O
13. **송장/배송처리 API**: 존재하나 1차 구현 제외 (조회만)
14. **주문조회 기간·상태**: 쿠팡 정책 (공식 문서 준수)
15. **테스트/샌드박스**: 공식 문서 확인 필요
16. **실사용 전 심사·계약**: 사업자 인증만. 별도 MD 승인 불요
17. **API 호출 제한**: WING Open API 정책·응답 헤더 준수. 연동정보 수정은 **주 10회 제한**
18. **엑클로드 구현 일치**: `authType: ['hmac','ip_whitelist']`, IP 54.180.45.46 등록, upstream `api-gateway.coupang.com`. 공식과 일치
19. **현재 안내 문제점**: "쿠팡은 URL이 필요하다"는 **자체개발(직접입력) 방식에 한함**. 연동업체 선택 시에는 URL·IP 입력이 없음. 현재 안내 문구는 이 조건을 구분하지 않음
20. **최종 판정**: **판매자 직접연결 가능** (근거등급: 확정)

### 2-2. 스마트스토어 (`smartstore`)

1. **공식 서비스명**: 네이버 스마트스토어 / 커머스API
2. **공식 문서**: `apicenter.commerce.naver.com` (커머스API센터), 스마트스토어센터
3. **판매자 입점 계정**: O
4. **판매자 직접 키 발급**: O — **내 스토어 애플리케이션** 방식 (아래 5절 A 경로)
5. **엑클로드 별도 승인**: **내 스토어 앱 방식은 불필요**. (솔루션 방식은 별도 — 5절 B)
6. **판매자가 엑클로드 선택**: X (내 스토어 앱은 판매자 자기 앱)
7. **인증 방식**: OAuth2 Client Credentials + **전자서명(bcrypt+Base64)**. Client ID(애플리케이션 ID)/Client Secret. 토큰 유효 3시간
8. **사용자 입력값**: 계정명, Client ID, Client Secret, type(기본 SELF)
9. **엑클로드가 보여줘야 하는 값**: API 호출 IP (판매자가 커머스API센터에 등록). 업체 URL·Redirect URI 불요
10. **고정 IP**: 등록 항목 존재(API 호출 IP). GitHub 사례에서 IP 등록 확인됨. **필수 여부는 커머스API센터 화면 기준 재확인 권장**
11. **Redirect/Callback**: 불필요 (Client Credentials)
12. **주문조회 API**: O (변경 상품주문 내역 조회 등)
13. **송장/배송처리 API**: O (SSOT `order_confirm`,`invoice_upload` 포함)
14. **주문조회 기간·상태**: 커머스API 가이드 준수
15. **테스트/샌드박스**: 공식 확인 필요
16. **실사용 전 심사**: 내 스토어 앱은 심사 없음. **통합매니저 권한** 스토어만 앱 등록 가능. **API 호출 IP는 한 애플리케이션에 최대 3개**(직접 확인). 이미 앱이 있으면 **기존 앱에 엑클로드 IP만 추가**(새 앱 등록 불필요)
17. **API 호출 제한**: 커머스API Rate Limit
18. **엑클로드 구현 일치**: `authType: ['oauth2','ip_whitelist']`, 전자서명 방식, upstream `api.commerce.naver.com`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내는 "커머스API 애플리케이션을 등록하고 IP 추가"로만 서술 → **내 스토어 앱 vs 커머스솔루션마켓** 경로 구분 없음. "URL 입력 불필요"는 사실이나 명시 필요. 통합매니저 권한·기존 앱 재사용(IP만 추가) 안내 누락
20. **최종 판정**: **판매자 직접연결 가능** (내 스토어 앱, 근거등급: 확정) / 솔루션 방식은 별도 장기 경로 (5절 B)

### 2-3. 11번가 (`eleven`)

1. **공식 서비스명**: 11번가 셀러오피스 / 11ST OPEN API
2. **공식 문서**: `openapi.11st.co.kr` (OPEN API CENTER)
3. **판매자 입점 계정**: O
4. **판매자 직접 키 발급**: O — 셀러오피스 최하단 OpenAPI → 서비스 등록 → 32자리 API Key
5. **엑클로드 별도 승인**: 원칙적으로 불필요. 단, 일부 API 접근권한(Seller API 정보) 설정 시 **셀링툴 업체 선택**이 요구되는 사례 확인됨 → **공식 확인 필요**
6. **판매자가 엑클로드 선택**: **일부 흐름에서 필요할 수 있음** (접속권한 → 셀링툴 업체 선택). 재확인 필요
7. **인증 방식**: OPEN API KEY (`openapikey` 헤더). OAuth 없음
8. **사용자 입력값**: 접속별칭, 11ST OPEN API KEY(32자리)
9. **엑클로드가 보여줘야 하는 값**: (셀링툴 선택 요구 시) 엑클로드 업체명. IP·URL은 센터 안내 기준
10. **고정 IP**: **공식 확인 필요** (센터 안내 확인)
11. **Redirect/Callback**: 불필요
12. **주문조회 API**: O (Seller REST)
13. **송장/배송처리 API**: O (SSOT 포함)
14. **조회 기간·상태**: 11번가 정책
15. **테스트/샌드박스**: 공식 확인 필요
16. **실사용 전 심사**: 확인 필요 (셀링툴 등록 절차)
17. **API 호출 제한**: 11번가 정책 (일 호출 한도 `overedTraffic` 오류 존재)
18. **엑클로드 구현 일치**: `authType: ['api_key','xml_api']`, `openapikey` 헤더, upstream `api.11st.co.kr`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내 링크가 `openapi.11st.co.kr`로 되어 있으나 실제 발급 시작점은 **셀러오피스 최하단 OpenAPI 버튼**. 셀링툴 업체 선택 필요 여부·IP 요건이 안내에 없음
20. **최종 판정**: **판매자 직접연결 가능** (셀링툴 선택 요구 여부는 조건부 — 근거등급: 조건부)

### 2-4. 카페24 (`cafe24`)

1. **공식 서비스명**: 카페24 / Cafe24 Admin API
2. **공식 문서**: `developers.cafe24.com`, `developer.cafe24.com/docs/guide/authentication_security_guide.html`
3. **판매자 입점 계정**: O
4. **판매자 직접 키 발급**: 현재 베타는 **판매자가 개발자센터에서 자기 App을 생성**해 Client ID/Secret 발급 (SSOT `requiredInputs`에 clientId/clientSecret 포함). → 판매자가 카페24 개발자 등록 필요
5. **엑클로드 별도 승인**: 현재 판매자 앱 방식은 불필요. (엑클로드 단일 앱스토어 앱으로 전환 시 앱 등록·심사 필요 — 별도 트랙)
6. **판매자가 엑클로드 선택**: X (OAuth 동의로 대체)
7. **인증 방식**: OAuth2 **Authorization Code**. `authorize` → code → `token`. access_token ~2h, refresh_token ~2주
8. **사용자 입력값**: 계정명, 쇼핑몰 ID(mallId), Client ID, Client Secret
9. **엑클로드가 보여줘야 하는 값**: **Redirect URI** = `https://www.excload.com/api/order/integration/cafe24/callback`, scope `mall.read_order`
10. **고정 IP**: 불필요 (OAuth)
11. **Redirect/Callback**: **필수** (개발자센터 앱에 정확히 등록)
12. **주문조회 API**: O (`mall.read_order`)
13. **송장/배송처리 API**: O (SSOT FUTURE_ACTIONS 포함)
14. **조회 기간·상태**: cafe24 문서
15. **테스트/샌드박스**: 개발자 회원가입 시 테스트 쇼핑몰 생성 가능
16. **실사용 전 심사**: 판매자 앱 방식은 심사 없음. 앱스토어 배포 시 심사
17. **API 호출 제한**: Admin API Rate Limit (scope별 호출건수)
18. **엑클로드 구현 일치**: `authType: 'oauth2'`, Redirect URI·scope 일치, upstream `*.cafe24api.com`(suffix). 공식과 일치
19. **현재 안내 문제점**: 현재 안내는 대체로 정확. 다만 **"판매자가 직접 개발자센터 앱을 만들어야 한다"**는 전제(비개발자에게 진입장벽)를 명시하지 않음
20. **최종 판정**: **판매자 직접연결 가능** (판매자 개발자 앱 전제 — 근거등급: 확정)

### 2-5. 롯데ON (`lotteon`)

1. **공식 서비스명**: 롯데ON / 롯데ON OpenAPI
2. **공식 문서**: `api.lotteon.com/apiGuide/`, 롯데ON 스토어센터
3. **판매자 입점 계정**: O (사업자 인증·입점 완료 필요)
4. **판매자 직접 키 발급**: O — 판매자정보 → OpenAPI관리 → 정보설정 → 서버 IP 등록 또는 셀러툴 선택 → 키발급
5. **엑클로드 별도 승인**: **서버 IP 직접등록 방식이면 불필요**. 셀러툴 선택 방식이면 엑클로드가 목록에 등록되어야 함
6. **판매자가 엑클로드 선택**: 선택 (호스팅/셀러툴 방식 사용 시). IP 직접등록이면 불요
7. **인증 방식**: API 인증키(Query `Key` 파라미터) + **IP 등록**
8. **사용자 입력값**: 계정명, 판매자 ID, API 인증 KEY, 최상위 거래처번호(tr_no), Shop ID(선택)
9. **엑클로드가 보여줘야 하는 값**: **서버 IP**(다수는 `;`로 구분) 또는 셀러툴명(엑클로드)
10. **고정 IP**: **필수** (서버 IP 등록 또는 셀러툴 선택 후 키 발급 활성화)
11. **Redirect/Callback**: 불필요
12. **주문조회 API**: O (출고지시·상품준비 등)
13. **송장/배송처리 API**: O (SSOT 포함, 1차는 조회)
14. **조회 기간·상태**: 롯데ON 정책
15. **테스트/샌드박스**: 공식 확인 필요
16. **실사용 전 심사**: 입점·사업자 인증
17. **API 호출 제한**: **1분당 10,000회**. 인증키 **유효기간 1년(매년 재발급)**
18. **엑클로드 구현 일치**: `authType: ['api_key','ip_whitelist']`, Query Key, 1년 만료, upstream `openapi.lotteon.com`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내는 "필요 시 URL·IP 등록"으로 모호. 실제로는 **서버 IP 등록이 키 발급의 필수 선행조건**. 인증키 1년 만료 안내 없음
20. **최종 판정**: **판매자 직접연결 가능** (IP 직접등록 방식 — 근거등급: 확정)

### 2-6. SSG.COM (`ssg`)

1. **공식 서비스명**: SSG.COM / SSG eAPI (파트너오피스)
2. **공식 문서**: `po.ssgadm.com` (파트너오피스, 로그인 후), `eapi.ssgadm.com`
3. **판매자 입점 계정**: O (입점 계약 완료 후 업체번호 생성)
4. **판매자 직접 키 발급**: O — 파트너오피스 → API 관리 → API 계정정보 → API 회원정보 작성 → 운영/테스트 서버 IP 등록 → 이메일 인증 → 인증키·API 사용자 ID
5. **엑클로드 별도 승인**: 입점·**MD 승인** 후 (신세계 가입·MD 승인 언급). 엑클로드 등록은 서버 IP 등록으로 처리
6. **판매자가 엑클로드 선택**: X (서버 IP 직접등록 방식)
7. **인증 방식**: API 인증키(Authorization 헤더) + **서버 IP 등록**. OAuth 없음
8. **사용자 입력값**: 계정명, 협력사코드(로그인 ID), API 인증키
9. **엑클로드가 보여줘야 하는 값**: **운영·테스트 서버 접속 IP**(엑클로드 outbound IP)
10. **고정 IP**: **필수** (운영/테스트 서버 IP 등록 + 이메일 인증)
11. **Redirect/Callback**: 불필요
12. **주문조회 API**: O (`listShppDirection`, `listWarehouseOut`)
13. **송장/배송처리 API**: O (SSOT 포함, 1차 조회만)
14. **조회 기간·상태**: eAPI 기간 제한 (7~180일, API별 상이)
15. **테스트/샌드박스**: O (`qa-eapi.ssgadm.com`)
16. **실사용 전 심사**: 입점·MD 승인·이메일 인증
17. **API 호출 제한**: eAPI 정책
18. **엑클로드 구현 일치**: `authType: ['api_key','ip_whitelist']`, upstream `eapi.ssgadm.com`+`qa-eapi`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내는 "IP·URL 등록"으로 서술. 실제로는 **운영/테스트 서버 IP 모두 등록 + 이메일 인증 + MD 승인**이 선행. URL 항목은 없음
20. **최종 판정**: **판매자 직접연결 가능** (입점·MD 승인 후 — 근거등급: 조건부)

### 2-7. CJ온스타일 (`cjonstyle`)

1. **공식 서비스명**: CJ온스타일 / 표준 API (파트너시스템)
2. **공식 문서**: `partners.cjonstyle.com/standardApi/apiGuide` (로그인 후 상세)
3. **판매자 입점 계정**: O (입점 협력사 전용)
4. **판매자 직접 키 발급**: O — 파트너시스템 → API 정보관리 → 직접개발 + 운영 IP 등록 → vendorCode·authenticationKey
5. **엑클로드 별도 승인**: 입점 협력사 한정 (일반 셀러 대상 아님)
6. **판매자가 엑클로드 선택**: X
7. **인증 방식**: Header `vendorCode` + `authenticationKey`(60자) + **IP whitelist**
8. **사용자 입력값**: 계정명, 협력업체코드(6자), API 인증키, 배송타입 코드(선택)
9. **엑클로드가 보여줘야 하는 값**: **운영 IP**(엑클로드 outbound IP)
10. **고정 IP**: **필수**
11. **Redirect/Callback**: 불필요
12. **주문조회 API**: 존재하나 **Path가 SSOT placeholder** — 미확정
13. **송장/배송처리 API**: 1차 제외
14. **조회 기간·상태**: 파트너 Docs(로그인) 확인 필요
15. **테스트/샌드박스**: 공식 확인 필요
16. **실사용 전 심사**: 입점 협력사 계약
17. **API 호출 제한**: 파트너 Docs 확인 필요
18. **엑클로드 구현 일치**: `apiStatus: restricted`, Path placeholder → **미완성**. host `api.cjonstyle.com` planned
19. **현재 안내 문제점**: 현재 안내가 일반 셀러도 되는 것처럼 읽힐 수 있음 → 실제는 **입점 협력사 전용**. API Path 미확정
20. **최종 판정**: **공식 확인 필요** (로그인 문서·Path 확정 필요 — 근거등급: 미확정)

### 2-8. NHN커머스/샵바이 (`shopby`)

1. **공식 서비스명**: 샵바이(shop by) / NHN커머스 Server API
2. **공식 문서**: `server-docs.shopby.co.kr`, `workspace-help.nhn-commerce.com`
3. **판매자 입점 계정**: O (자사몰 구축형)
4. **판매자 직접 키 발급**: O — 워크스페이스 셀러어드민 → 앱 등록 → systemKey / 서비스어드민 → 개발연동정보 → mallKey(외부 연동키)
5. **엑클로드 별도 승인**: 앱 등록 필요 (셀러어드민 앱 직접 설치 가능하도록 업데이트됨)
6. **판매자가 엑클로드 선택**: X
7. **인증 방식**: systemKey + mallKey (Server API Header). (Authorization 방식 또는 mallKey 방식 2종)
8. **사용자 입력값**: 계정명, systemKey, 외부 연동키(mallKey), 쇼핑몰 도메인(선택)
9. **엑클로드가 보여줘야 하는 값**: (앱 등록 관련) 앱 정보. IP whitelist 없음
10. **고정 IP**: 불필요 (NHN outbound IP whitelist 없음)
11. **Redirect/Callback**: 불필요 (Server API)
12. **주문조회 API**: O (`GET /orders` v1.1)
13. **송장/배송처리 API**: O (SSOT 포함)
14. **조회 기간·상태**: shop by 문서
15. **테스트/샌드박스**: 공식 확인 필요
16. **실사용 전 심사**: 앱 등록
17. **API 호출 제한**: **Token Bucket — 1초 100회 초과 시 오류**
18. **엑클로드 구현 일치**: `authType: 'api_key'`, systemKey+mallKey, upstream `server-api.e-ncp.com`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내가 "Server API 키 발급"으로만 단순. systemKey(앱)와 mallKey(외부 연동키)의 **발급 위치가 다름**을 구분해야 함
20. **최종 판정**: **판매자 직접연결 가능** (앱 등록 전제 — 근거등급: 확정)

### 2-9. 고도몰 (`godomall`)

1. **공식 서비스명**: 고도몰5 / NHN커머스 Open API(openhub)
2. **공식 문서**: `devcenter.godo.co.kr` (로그인 후), `openhub.godo.co.kr`
3. **판매자 입점 계정**: O (고도몰 쇼핑몰)
4. **판매자 직접 키 발급**: △ — **partner_key는 엑클로드(개발사) env**, 쇼핑몰별 **user key**는 판매자/제휴사 신청·승인
5. **엑클로드 별도 승인**: **O** — devcenter 제휴사(partner_key) 등록 필요. openhub 호출 IP 허용은 NHN 1:1 문의
6. **판매자가 엑클로드 선택**: 제휴 구조 (user key 승인)
7. **인증 방식**: partner_key + user key (POST XML). OAuth 없음
8. **사용자 입력값**: 계정명, 쇼핑몰 도메인, 사용자키(userKey), mallSno(선택)
9. **엑클로드가 보여줘야 하는 값**: (제휴사 등록·IP 허용은 엑클로드↔NHN 절차)
10. **고정 IP**: **필수(문의)** — openhub 호출 IP 허용을 NHN 1:1 문의로 처리
11. **Redirect/Callback**: 불필요
12. **주문조회 API**: O (`Order_Search.php` POST XML)
13. **송장/배송처리 API**: SSOT 포함, 1차 제외
14. **조회 기간·상태**: 고도몰 정책
15. **테스트/샌드박스**: O (`sbopenhub.godo.co.kr`, 1차 제외)
16. **실사용 전 심사**: 제휴사 등록 + user key 승인
17. **API 호출 제한**: **Token Bucket — 1초 100회 초과 429**, `ratelimit-available-level` 헤더
18. **엑클로드 구현 일치**: `authType: ['api_key','ip_whitelist']`, partner_key(env)+userKey, upstream `openhub.godo.co.kr`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내는 "partner_key·user_key 발급"으로 서술 → 실제로는 **partner_key는 엑클로드가 제휴사로 보유, 판매자는 user key만**. IP 허용 문의 절차 누락
20. **최종 판정**: **엑클로드 사업자(제휴사) 승인 후 가능** (근거등급: 조건부)

### 2-10. 메이크샵 (`makeshop`)

1. **공식 서비스명**: 메이크샵 / Makeshop APP API
2. **공식 문서**: `developer.makeshop.co.kr` (개발자센터)
3. **판매자 입점 계정**: O (메이크샵 쇼핑몰)
4. **판매자 직접 키 발급**: X — **APP은 엑클로드가 등록**(MAKESHOP_CLIENT_ID/SECRET env). 판매자는 샵스토어에서 APP 설치·scope 동의 + 접근 허용 IP 등록
5. **엑클로드 별도 승인**: **O** — 개발자센터 APP 등록 + **심사(영업일 5~10일)**
6. **판매자가 엑클로드 선택**: 샵스토어 APP 설치로 대체
7. **인증 방식**: OAuth2/OIDC. **client_credentials** (Basic auth) → Bearer, 토큰 5분. (개발정보 유형은 Authorization Code지만 토큰 발급은 client_credentials)
8. **사용자 입력값**: 계정명, shop_uid/shopId, 쇼핑몰 도메인(선택)
9. **엑클로드가 보여줘야 하는 값**: APP URL, **접근 허용 IP**(엑클로드 outbound IP, 최대 10개)
10. **고정 IP**: **필수** (개발 정보 관리 → 접근 허용 IP, 엔터 구분 최대 10개)
11. **Redirect/Callback**: APP URL 필요 (설치 랜딩). 토큰은 Callback 불요
12. **주문조회 API**: O (`GET /api/v1/:shopId/order/2`)
13. **송장/배송처리 API**: SSOT 포함, 1차 제외
14. **조회 기간·상태**: **주문 2.0 조회 30일·1000건 제한**, 1일 단위 권장
15. **테스트/샌드박스**: 파트너 승인 전에도 개발·테스트 가능 (심사·출시는 승인 후)
16. **실사용 전 심사**: **O — 영업일 5~10일 심사, 반려 사유 존재**
17. **API 호출 제한**: 토큰 발급 shop_uid+IP당 **1분 5회**, 토큰 5분
18. **엑클로드 구현 일치**: `authType: ['oauth2','ip_whitelist']`, client_credentials, upstream `connect.makeshop.co.kr`. 공식과 일치
19. **현재 안내 문제점**: 현재 안내 "shop_domain·shop_key 등 입력"은 부정확 — 실제 사용자 입력은 **shop_uid** 중심이고 Client ID/Secret은 엑클로드 env. 심사·IP 등록 절차 누락
20. **최종 판정**: **엑클로드 사업자(APP 심사) 후 가능** (근거등급: 확정)

---

## 3. 네이버 두 경로 구분 (과제 4·5절)

### A. 내 스토어 애플리케이션 — **현재 베타 방식**

- **경로**: 커머스API센터 로그인 → [애플리케이션 > 내스토어 애플리케이션] → 애플리케이션 등록 → 스토어 선택 → 이름·설명·API 선택 → 등록
- **발급값**: 애플리케이션 ID(=Client ID), 시크릿(=Client Secret)
- **조건**: 스토어의 **통합매니저 권한** 보유자만 등록. **API 호출 IP는 한 애플리케이션에 최대 3개**(직접 확인). 이미 앱이 있으면 기존 앱에 IP만 추가
- **토큰 type**: `SELF` (앱에 연결된 1개 스마트스토어 계정 리소스)
- **인증**: OAuth2 Client Credentials + 전자서명(`client_id_timestamp`를 client_secret salt로 bcrypt → Base64), 토큰 3시간
- **IP**: 커머스API센터에 API 호출 IP 등록 (사례 확인). 필수 여부 화면 재확인
- **URL/Redirect**: 불필요
- **판정**: 판매자 직접연결 가능 (확정)

### B. 커머스솔루션마켓 / 솔루션 애플리케이션 — **별도 장기 경로**

- **개념**: 엑클로드가 네이버 **개발사로 입점동의** 후 솔루션을 등록·심사·판매, 판매자가 솔루션 구독
- **입점 조건**: [커머스API센터 > 계정 > 개발사 입점관리]. **국내 법인 사업자만** 입점동의 가능(24.10 기준, 점진 확대)
- **토큰 type**: 솔루션 앱은 `SELF`(솔루션사 시스템 API: 사용 시작 승인 등) + `SELLER`(구독 판매자 스마트스토어 데이터, `account_id` 필요)
- **절차**: 개발 → 테스트 → 심사 → 입점
- **판정**: 엑클로드 사업자 승인 후 가능 (조건부, 장기)
- **주의**: 현재 베타(A)와 **혼동 금지**. 두 경로를 한 안내에 섞지 말 것

---

## 4. 기존 조사 재검증 결과 (과제 5절)

| 기존 서술 | 재검증 결과 | 근거등급 |
|-----------|-------------|:---:|
| 스마트스토어는 URL 입력 불필요 | **사실**. 내 스토어 앱은 Client ID/Secret+전자서명만, URL·Redirect 없음 | 확정 |
| 스마트스토어 API 호출 IP 선택/필수 | 호출 IP **등록 항목 존재**, 사례상 등록됨. 필수 여부는 화면 기준 재확인 | 조건부 |
| 스토어당 애플리케이션 최대 개수 | 화면 직접 확인 결과 **최대 3개는 애플리케이션 수가 아니라 한 애플리케이션의 API 호출 IP 개수**. 기존 앱이 있으면 재등록 없이 IP만 추가. (공식 공지 문구와 상충 → 재확인 권장) | 조건부 |
| Client ID/Secret 발급 위치 | **커머스API센터 > 내스토어 애플리케이션** (스마트스토어센터 아님) | 확정 |
| 주문 판매자 API 권한 | 앱 등록 시 "API 선택"에서 주문 관련 권한 선택 (상세 권한명 로그인 후 확인) | 조건부 |
| 판매자센터에서 시작해도 커머스API센터로 이동 | 커머스API센터가 앱·키 발급 주체. 재확인 완료 | 확정 |
| **쿠팡은 URL이 필요하다** | **자체개발(직접입력) 방식에 한해** 업체명·URL·IP 필수. 연동업체 선택 시 불요. **다른 몰에 일반화 금지** | 확정 |

---

## 5. 요약 판정 (전체)

| 판정 | 채널 |
|------|------|
| 판매자 직접연결 가능 | 쿠팡, 스마트스토어(내스토어앱), 11번가(조건부), 카페24, 롯데ON, SSG(조건부), 샵바이 |
| 엑클로드 사업자 승인 후 가능 | 고도몰, 메이크샵, 카카오톡스토어, 무신사, (네이버 솔루션 경로) |
| 지정 셀러툴만 가능 | G마켓/옥션(ESM), 플레이오토·사방넷·이지어드민(허브 보조) |
| 공식 확인 필요 | CJ온스타일, 지그재그, 텐바이텐, 도매꾹, 큐텐, 에이블리 |
| 현재 직접연동 불가 | 티몬·위메프(엑셀), 오늘의집·브랜디·하이버·발란·바이즐(hub_only), 핫트랙스·바보사랑·1300K·골디(엑셀), excel_* |
| 구현 예정(준비중) | 쇼피파이(Shopify) |
