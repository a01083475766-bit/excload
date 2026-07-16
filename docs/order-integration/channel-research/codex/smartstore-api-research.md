# 네이버 스마트스토어 커머스API 독립 조사

- 조사 날짜: 2026-07-17 (KST)
- 조사 대상: 네이버 스마트스토어
- 기준 문서: 네이버 커머스API 최신 문서 2.82.0(2026-07-07 표시), 커머스API센터 공개 안내 및 네이버 공식 GitHub 기술지원
- 조사 원칙: 현재 엑클로드 코드는 구현 상태 확인에만 사용했으며, API 가능 여부와 정책 판단은 네이버 공식 자료를 우선했다.
- 조사 제한: 판매자 계정 로그인, 실제 애플리케이션 등록 화면 확인, 인증 키 확인, API 실호출은 하지 않았다.

## 1. 조사 범위

다음 두 방식을 분리해 조사했다.

1. **내 스토어 애플리케이션**: 스마트스토어 통합매니저가 자기 스토어용 애플리케이션을 등록하고 애플리케이션 ID(Client ID)와 애플리케이션 시크릿(Client Secret)을 발급받아 `SELF` 토큰으로 자기 스토어 리소스에 접근하는 방식.
2. **커머스솔루션마켓 솔루션 애플리케이션**: 엑클로드가 솔루션 개발사로 입점해 공용 애플리케이션을 운영하고, 솔루션을 구독·동의한 판매자마다 `SELLER` 토큰을 발급해 해당 판매자 리소스에 접근하는 방식.

조사 항목은 가입·신청 주체, 사업자 조건, 앱 등록·활성화, 인증, IP와 URL, 주문조회, 수량 클레임, 발주·발송, 개인정보, 호출 제한, 현재 코드와의 차이, 사용자 안내다.

## 2. 현재 엑클로드 구현 상태

### 2.1 상태와 연결 화면

- 채널 레지스트리에서 스마트스토어는 `available`, `beta`, `direct_api`로 표시된다.
- 인증 유형은 `oauth2 + ip_whitelist`, 프록시 대상 호스트는 `api.commerce.naver.com`이다.
- 사용자가 입력하는 값은 엑클로드 내부 계정명, Client ID, Client Secret이다. `type`은 화면에서 `SELF`로 고정되어 있다.
- 스토어 ID, 판매자 ID, Redirect URI, Callback URL, Webhook URL 입력란은 없다.
- 화면은 엑클로드 업체명 `엑클로드`, URL `https://www.excload.com`, API 호출 IP `54.180.45.46`을 "커머스API센터 등록용"으로 보여 준다.
- 화면 안내는 "내 스토어 애플리케이션" 등록, 주문 API 권한 추가, 고정 IP 등록을 지시한다.

주요 코드:

- `app/lib/order-integration/malls.ts`
- `app/lib/order-integration/mall-integration-specs.ts`
- `app/lib/order-integration/mall-setup-guides.tsx`
- `app/components/order-integration/SmartstoreIntegrationForm.tsx`

### 2.2 인증과 보관

- `grant_type=client_credentials`, `type=SELF`로 `/external/v1/oauth2/token`을 호출한다.
- `${clientId}_${timestamp}`를 Client Secret을 salt로 bcrypt 해싱한 뒤 Base64 인코딩해 `client_secret_sign`을 만든다.
- 토큰 요청은 `application/x-www-form-urlencoded`다.
- Client ID와 Client Secret은 암호화 저장된다. Client ID도 비밀 필드 저장소에 넣지만 사용자 응답에서는 평문 Client ID를 다시 내려 준다.
- 연결 테스트는 토큰 발급 성공만 확인한다. 주문 API 그룹 권한과 주문 상세조회 성공까지 확인하지 않는다.
- 액세스 토큰을 캐시하지 않고 인증이 필요한 각 요청 전에 토큰 발급 API를 다시 호출한다.

주요 코드:

- `app/lib/smartstore/client.ts`
- `app/lib/order-integration/smartstore-account.ts`
- `app/api/order/integration/smartstore/test/route.ts`

### 2.3 주문조회

- 변경 상품 주문 내역 조회 API를 호출하고, 얻은 상품주문번호로 상품 주문 상세 내역 조회 API를 호출한다.
- 조회일수는 1~30일이며 기본 7일이다.
- 전체 기간을 24시간 이하 구간으로 나눈다. 7일은 7구간, 30일은 30구간이다.
- 조회 종료 시각은 현재보다 5초 전으로 둔다.
- `more.moreFrom`을 다음 요청의 `lastChangedFrom`으로, `more.moreSequence`를 그대로 다음 요청에 넣는다.
- 구간 경계에서 중복된 상품주문번호를 제거한다.
- 상세조회는 최대 300개씩 나누고 `quantityClaimCompatibility: true`를 전송한다.
- 주문이 0건이면 정상 빈 배열로 처리한다.
- 같은 커서가 반복되면 무한 루프 방지를 위해 중단하지만, 경고나 재시도 없이 중단하므로 실제 응답 이상 시 일부 주문 누락 가능성이 있다.

주요 코드와 테스트:

- `app/lib/smartstore/client.ts`
- `app/lib/smartstore/collect-smartstore-orders.test.ts`
- `app/lib/smartstore/smartstore.test.ts`
- `app/api/order/integration/smartstore/fetch-orders/route.ts`

### 2.4 수량 클레임과 개인정보

- 처리 수량은 `remainQuantity -> quantity -> initialQuantity` 순서로 선택한다.
- 결제금액은 `remainPaymentAmount -> initialPaymentAmount -> totalPaymentAmount` 순서로 선택한다.
- `claimType`을 취소·반품·교환 라벨로 표시한다.
- 주문자 이름·전화번호, 수취인 이름·전화번호·주소·배송메모를 수집하고 표준 주문 행에 저장한다.
- 발송 가능 여부를 `claimStatus`, `remainQuantity`, 발주 상태와 함께 최종 검증하는 스마트스토어 전용 송장 어댑터는 없다.

### 2.5 송장전송

- 레지스트리에는 스마트스토어 송장 어댑터가 등록되지만 실제 API를 호출하지 않는 차단용 어댑터다.
- 현재는 `PROVIDER_SPEC_INCOMPLETE`로 실패시키며, 사유는 발송 API 요청 필드와 결과 구조가 저장소 규격에 확정되지 않았다는 것이다.
- 따라서 **현재 엑클로드에서 스마트스토어 송장전송은 미구현**이다.

주요 코드와 테스트:

- `app/lib/order-integration/transmission/real-adapters.ts`
- `app/lib/order-integration/transmission/__tests__/real-adapters.test.ts`

### 2.6 프록시

- 엑클로드 서버는 스마트스토어 호출 전에 고정 IP 프록시 설정을 강제한다.
- 프록시 허용 호스트에 `api.commerce.naver.com`이 등록되어 있다.
- 프록시가 없으면 연결 테스트와 주문조회가 모두 실패한다.

주요 코드:

- `app/lib/integration-proxy/config.ts`
- `services/coupang-proxy/allowed-hosts.mjs`
- `app/api/order/integration/smartstore/transport/route.ts`

## 3. 핵심 결론

| 항목 | 결론 | 확정도 |
| --- | --- | --- |
| 판매자 자기 스토어용 앱 생성 | 통합매니저가 스토어별 최대 1개 등록 가능 | 확정 |
| 개인사업자 내 스토어 앱 | 국내 개인·국내사업자 계정이 가능하므로 가능 | 확정 |
| 내 스토어 앱 심사 | 현재 등록 즉시 사용 가능, 향후 검수 추가 가능 | 확정 |
| 현재 SELF 인증 구현 | 토큰 규격은 공식 문서와 일치 | 확정 |
| SELF 키를 엑클로드에 입력하는 운영 | 기술적으로 호출 가능하나 외부 SaaS 위탁 허용 정책은 공개 문서로 확정 불가 | 미확정 |
| 여러 판매자 대상 공식 서비스 | 엑클로드가 국내 법인 개발사로 입점하고 솔루션 테스트·심사를 거쳐야 함 | 확정 |
| 고정 IP | 허용되지 않은 IP는 `GW.IP_NOT_ALLOWED`; 운영상 등록 IP 호출이 필요 | 조건부 확정 |
| 내 스토어 앱의 IP 입력 필수 여부·개수 | 공개 문서에 등록 화면 규격이 없어 로그인 확인 필요 | 미확정 |
| 서비스 URL | 내 스토어 앱에 필요하다는 공개 근거 없음 | 공식 확인 불가 |
| Redirect/Callback | SELF Client Credentials에는 필요 없음 | 확정 |
| 주문조회 | 가능, 현재 코드 구현됨 | 확정 |
| 송장전송 API | 공식 API 존재, 현재 엑클로드는 미구현 | 확정 |

**최종 판정: `판매자 직접연결 가능하지만 계정 테스트 및 정책 확인 필요`.**

토큰 생성과 주문 API 규격만 보면 현재 SELF 베타는 동작 가능한 구조다. 그러나 내 스토어 애플리케이션은 공식 안내상 판매자가 자기 스토어를 직접 관리하는 용도다. 판매자가 Client Secret을 외부 SaaS인 엑클로드에 제공·위탁하는 형태가 허용되는지 공개 정책에서 확인되지 않았다. 베타 실사용 전 네이버 커머스API센터 기술문의로 확인해야 한다. 여러 판매자에게 장기적으로 공식 제공하려면 커머스솔루션마켓 방식이 맞다.

## 4. 내 스토어 애플리케이션 방식

### 신청 주체와 조건

- 스마트스토어센터의 **통합매니저 권한**을 가진 커머스 회원이 커머스API센터 계정을 생성한다.
- 통합매니저 권한이 있는 스토어 자산만 API로 접근할 수 있다.
- 스마트스토어 미가입자는 내 스토어용 커머스API센터 계정을 만들 수 없다.
- 국내 개인 및 국내사업자 유형이 가능하다. 따라서 개인사업자도 가능하다.
- 스토어별 애플리케이션은 최대 1개다. API 그룹은 기존 애플리케이션에 추가·삭제할 수 있다.
- 현재는 애플리케이션 등록 후 바로 사용할 수 있고 별도 검수는 없다. 향후 검수 추가 가능성이 공식 FAQ에 명시되어 있다.
- 통합매니저 권한을 잃으면 내 스토어 애플리케이션이 조회되지 않는다.

### 키와 토큰

- 판매자가 자기 애플리케이션의 Client ID와 Client Secret을 발급받는다.
- `type=SELF`는 자기 자신의 리소스에 대한 토큰이다. 스토어 ID 또는 `account_id`를 토큰 요청에 넣지 않는다.
- 판매자마다 자기 스토어 앱과 키가 별도로 필요하다. 엑클로드 공용 SELF 앱 하나로 여러 판매자 리소스에 접근하는 구조가 아니다.

### 현재 엑클로드와의 관계

- 엑클로드 화면과 토큰 코드는 이 SELF 구조를 구현하고 있다.
- 다만 공식 문서가 설명하는 본래 주체는 "판매자가 자기 스토어를 직접 관리"하는 경우다.
- 키를 엑클로드에 보관시키는 제3자 서비스 운영이 허용된다는 공개 근거는 찾지 못했다. 비밀정보의 위탁·보관·폐기 조건을 네이버에 확인해야 한다.

## 5. 커머스솔루션마켓 방식

### 신청 주체와 사업자 조건

- 엑클로드 운영사가 솔루션 개발사로 커머스API센터 개발사 입점 동의를 해야 한다.
- 2026-07-17 공개 FAQ와 입점 가이드 기준 솔루션 개발사 입점은 **국내 법인 사업자만 가능**하다. 개인사업자 솔루션 개발사 입점은 지원 예정으로 안내되어 있다.
- 솔루션을 등록하고 자체 테스트와 네이버 심사를 거친 뒤 마켓에 출시한다.
- 솔루션별 API 그룹 필요 사유, API 호출 IP, 보안, 개인정보 처리, 구독·해지 및 이벤트 훅 등을 심사한다.

### 판매자 연결 구조

- 판매자는 커머스솔루션마켓에서 솔루션을 선택하고 구독·정보제공 동의를 진행한다.
- 심사 후 승인형은 판매자 커머스ID 인증, JWE 수신·해석, 사용 승인 API가 추가된다.
- 솔루션 앱의 `SELF` 토큰은 솔루션 자체 시스템 API에 사용한다.
- 판매자의 주문·상품 데이터에는 공용 솔루션 Client ID/Secret과 판매자 `account_id`를 이용해 `type=SELLER` 토큰을 발급한다.
- 판매자가 각자 엑클로드에 Client Secret을 붙여 넣는 방식이 아니다.
- 커머스솔루션마켓 방식에서는 기존 스마트스토어센터의 "API 대행사 선택" 기능을 사용하지 않는다.

### 현재 엑클로드와의 차이

- 현재 코드는 판매자별 Client ID/Secret과 `SELF`를 저장한다.
- 공식 솔루션 방식은 엑클로드 공용 앱 키를 엑클로드가 보관하고, 판매자 UID로 `SELLER` 토큰을 발급한다.
- 따라서 현재 베타 SELF 방식은 공식 솔루션 방식과 동일하지 않으며, 장기 다판매자 서비스로 전환하려면 인증·구독·개인정보 삭제 흐름을 별도 구현해야 한다.

## 6. 신청 조건

1. 공식 API 서비스명: **네이버 커머스API**.
2. 스마트스토어 판매자센터: `https://sell.smartstore.naver.com`.
3. 커머스API센터: `https://apicenter.commerce.naver.com`.
4. 판매자센터에서 통합매니저 권한을 먼저 갖춘 뒤 커머스API센터 계정을 생성하는 구조다.
5. 커머스ID 및 2단계 인증이 사용된다. 공개 FAQ는 통합매니저 권한을 필수로 명시한다.
6. 내 스토어 애플리케이션은 스토어별 최대 1개다.
7. 현재는 등록 즉시 사용 가능하다. 비정상 대량 호출은 앱 비활성화 사유가 될 수 있다.
8. 주문조회와 발주·발송을 위해 애플리케이션에 **주문 API 그룹** 권한이 필요하다.
9. API 그룹의 정확한 화면 내 선택명과 등록 버튼명은 커머스API센터 로그인 후 확인해야 한다.
10. 내 스토어 앱의 별도 계약·API 사용료는 현재 없다. 향후 호출 제약·과금 정책 변경 가능성은 FAQ에 유보되어 있다.
11. 공개 문서에서 별도 샌드박스 또는 내 스토어용 테스트 계정 제공은 확인하지 못했다.

## 7. 인증 방식

### 공식 규격

- OAuth 2.0 Client Credentials Grant다.
- 토큰 URL: `POST https://api.commerce.naver.com/external/v1/oauth2/token`.
- Content-Type: `application/x-www-form-urlencoded`.
- 요청값: `client_id`, `timestamp`, `client_secret_sign`, `grant_type=client_credentials`, `type`와 SELLER인 경우 `account_id`.
- `timestamp`는 밀리초 Unix 시간이며 서명과 함께 5분간 유효하다.
- 서명 원문은 `${client_id}_${timestamp}`다.
- Client Secret을 bcrypt salt로 사용해 해싱하고 결과 바이트를 Base64 인코딩한다.
- 액세스 토큰은 3시간(10,800초) 유효하다.
- 남은 시간이 30분 이상이면 토큰 발급 요청 시 기존 토큰이 반환되고, 30분 미만이면 새 토큰이 발급된다. 새 토큰 발급 후에도 기존 토큰은 원래 만료까지 유효하다.
- Refresh Token은 제공되지 않는다. 같은 토큰 발급 API를 다시 호출한다.
- API 호출 시 `Authorization: Bearer {access_token}` 헤더를 사용한다.

### 주요 오류와 재시도

- `401 / GW.AUTHN`: 토큰 만료·오류 또는 잘못된 토큰 유형 가능. 토큰 재발급 후 1회 재시도를 권장한다.
- `403 / GW.IP_NOT_ALLOWED`: 애플리케이션에 허용되지 않은 IP에서 호출했다.
- `429 / GW.RATE_LIMIT`: API·애플리케이션 단위 초당 호출량 제한을 초과했다.
- `429 / GW.QUOTA_LIMIT`: 솔루션 판매자 리소스 등 할당량 제한을 초과했다.
- 토큰 요청 Content-Type과 body를 JSON으로 보내면 `client_id` 오류처럼 보일 수 있으므로 form-urlencoded를 사용해야 한다.
- Client Secret 재발급·변경 메뉴명과 기존 Secret 무효화 시점은 공개 문서로 확인하지 못했다.

### 현재 코드 판정

- 서명, 토큰 URL, Content-Type, grant type, SELF 유형은 공식 규격과 일치한다.
- 공식 토큰은 3시간 유효하지만 현재 코드는 토큰을 재사용하지 않고 API 요청마다 다시 발급 요청한다. 기능상 허용되지만 불필요한 호출과 Rate Limit 부담이 있다.
- `GW.AUTHN` 발생 시 토큰 재발급 후 원 API 재시도하는 공식 권장 fallback은 구현되어 있지 않다.

## 8. 판매자 입력값

| 값 | 공식 필요 여부 | 엑클로드 현재 입력 | 판정 |
| --- | --- | --- | --- |
| 계정명 | 네이버 값 아님, 엑클로드 내부 식별용 | 필수 | 일치(내부값) |
| Client ID | SELF 토큰 발급 필수 | 필수 | 일치 |
| Client Secret | 서명 생성 필수 | 최초 저장 시 필수 | 일치 |
| type | SELF 앱은 `SELF` | 읽기 전용 `SELF` | 일치 |
| 스토어 ID | SELF 토큰 요청에는 불필요 | 입력 없음 | 일치 |
| 판매자 ID/account_id | SELF에는 불필요, SELLER에는 필수 | 입력 없음 | SELF 기준 일치 |
| Redirect URI | SELF Client Credentials에 불필요 | 입력 없음 | 일치 |

Client ID와 Client Secret의 정확한 확인 메뉴명은 공개 문서만으로 확정하지 못했다. 사용자 안내에는 `커머스API센터 로그인 후 실제 메뉴명 확인 필요`라고 표시해야 한다.

## 9. 엑클로드 제공 정보

| 정보 | 내 스토어 앱 | 솔루션 앱 | 현재 안내 판정 |
| --- | --- | --- | --- |
| 업체명 `엑클로드` | 공개 문서상 필요 근거 없음 | 개발사·솔루션 정보로 필요 | SELF 안내에서는 불필요 가능성 |
| 서비스 URL `https://www.excload.com` | 공개 등록 규격에서 확인 불가 | 솔루션 사용연결 URL 등 별도 URL 존재 | SELF에 입력하라는 안내는 공식 확인 불가 |
| 홈페이지 URL | 공개 등록 규격에서 확인 불가 | 개발사/솔루션 심사 정보에 사용 가능 | 구분 필요 |
| Redirect URI | 불필요 | 심사 후 승인형 커머스ID 인증에서 JWE Redirect URL 필요 | SELF에는 표시하지 않아도 됨 |
| Callback URL | 불필요 | 기능별 별도 콜백이 있으면 해당 솔루션 규격 적용 | SELF에는 표시하지 않아도 됨 |
| Webhook URL | 불필요 | 구독·해지 등 이벤트 훅 운영에 사용 | SELF에는 표시하지 않아도 됨 |
| API 호출 IP `54.180.45.46` | 허용 IP 등록이 필요한 것으로 판단되나 입력 규격은 로그인 확인 필요 | 솔루션 등록 정보에 API 호출 IP 명시 | 조건부 일치 |

## 10. 고정 IP·URL·Redirect 요구사항

### 고정 IP

- 공식 오류 문서는 등록 허용 IP가 아닌 곳에서 호출하면 `403 GW.IP_NOT_ALLOWED`가 발생한다고 명시한다.
- 따라서 엑클로드 서버에서 호출하려면 실제 outbound IP `54.180.45.46`이 해당 애플리케이션의 허용 IP에 등록되어 있어야 한다고 보는 것이 안전하다.
- 다만 내 스토어 애플리케이션 등록 화면에서 IP가 필수 입력인지, IP 제한을 끌 수 있는지, 여러 IP를 몇 개까지 등록할 수 있는지, 변경 즉시 반영되는지 또는 재승인이 필요한지는 공식 공개 문서에 없다.
- 솔루션 애플리케이션은 공식 등록 가이드에 "API 호출 IP" 입력이 명시되어 있다.
- 최종 판정: **운영상 필수로 안내하되, 내 스토어 등록 화면의 필수·복수·변경 세부 규칙은 로그인 확인 필요**.

### URL

- SELF 인증은 서버 간 Client Credentials 방식이므로 OAuth 사용자 브라우저 복귀 URL이 없다.
- 내 스토어 앱 등록에 `서비스 URL` 또는 `홈페이지 URL` 입력란이 있다는 공식 공개 근거를 찾지 못했다.
- 현재 엑클로드 화면이 URL을 필수 등록 정보처럼 제시하는 것은 수정 대상이다. 실제 로그인 화면에 해당 입력란이 있을 때만 용도를 확인해 안내해야 한다.

### Redirect·Callback·Webhook

- 내 스토어 SELF 방식: Redirect URI, OAuth Callback URL, Webhook URL이 토큰·주문 API에 필요하지 않다.
- 솔루션 방식: 심사 후 승인형 판매자 커머스ID 인증은 JWE 수신 Redirect URL이 필요하고, 구독·해지 운영에는 이벤트 훅 URL이 사용된다.
- 두 방식의 URL을 혼합해 판매자에게 안내하면 안 된다.

## 11. 주문조회 API

### 사용 API

1. 변경 상품 주문 내역 조회
   - `GET /external/v1/pay-order/seller/product-orders/last-changed-statuses`
   - 기준: 주문일이 아니라 **최종 변경 일시**.
   - 신규 주문은 별도 "신규 주문 API"가 아니라 변경내역의 `PAYED` 등으로 포착할 수 있다.
2. 상품 주문 상세 내역 조회
   - `POST /external/v1/pay-order/seller/product-orders/query`
   - 상품주문번호 최대 300개.
   - `quantityClaimCompatibility=true`로 수량 클레임 대응 필드를 요청한다.
3. 주문별 상품주문번호 목록 조회
   - `GET /external/v1/pay-order/seller/orders/{orderId}/product-order-ids`
   - 현재 엑클로드 수집 흐름에서는 사용하지 않는다.

### 기간과 분할

- `lastChangedFrom`은 필수, `lastChangedTo`는 선택이다.
- `lastChangedTo`를 생략하면 시작 시각부터 24시간 후가 자동 종료 시각이다.
- 공개 문서는 `lastChangedTo`를 명시했을 때도 최대 24시간만 허용한다고 명시하지 않는다. 오류 코드 `104139 조회 가능한 날짜 범위를 초과`는 있으나 정확한 최대 과거 보관기간과 요청 구간 상한은 공개 설명에서 확인되지 않았다.
- 현재 코드의 24시간 분할은 보수적이며 API 기본 동작과 잘 맞지만, "공식 최대 24시간"이라는 코드 주석은 **일부 일치/공식 확인 불가**다.
- 오늘·3일·7일·30일을 일 단위로 나누는 구현은 안전한 접근이다. 실제 계정에서 30일 전 변경내역까지 허용되는지는 테스트 또는 기술문의가 필요하다.

### 페이지네이션

- 기본 최대 응답은 300개이며 `limitCount`가 300을 넘으면 최대 300개가 제공된다.
- 응답에 `more`가 있으면 `moreFrom`을 다음 `lastChangedFrom`, `moreSequence`를 다음 `moreSequence`에 넣는다.
- 같은 변경 시각의 여러 주문을 구분하기 위해 `moreSequence`가 필요하다.
- 현재 코드의 커서 전달 방식과 상품주문번호 중복 제거는 공식 설명과 일치한다.
- 공식 문서에는 같은 커서가 반복되는 정상 시나리오가 설명되어 있지 않다. 현재 코드의 반복 커서 중단 안전장치는 합리적이지만, 중단 사실을 오류로 알리지 않아 누락 감지가 어렵다.

### 상태와 개인정보

- 상품주문 상태: `PAYMENT_WAITING`, `PAYED`, `DELIVERING`, `DELIVERED`, `PURCHASE_DECIDED`, `EXCHANGED`, `CANCELED`, `RETURNED`, `CANCELED_BY_NOPAYMENT`.
- 발주 상태: `NOT_YET`, `OK`, `CANCEL`.
- 변경 유형에는 결제완료, 배송지변경, 발송처리, 클레임 요청·완료·철회, 구매확정, 교환 재배송 등이 있다.
- 상세 응답은 주문자 이름·연락처, 수취인 이름·연락처·주소, 배송메모를 제공한다.
- 선물 주문의 주문자 이름과 연락처는 마스킹된다. 주문자 ID도 개인정보 보호 목적의 마스킹·제한이 적용된다.
- 거래 종료 상태의 일부 민감 필드는 노출되지 않는 조건이 있다. 모든 개인정보 필드의 보존 가능 기간·마스킹 시점은 공개 API 스키마만으로 완전 확정하기 어렵다.

### 호출 제한과 0건

- Rate Limit은 API와 애플리케이션 단위의 토큰 버킷 방식이다. 고정 숫자는 정책에 따라 유동적이다.
- 응답 헤더 `GNCP-GW-RateLimit-Replenish-Rate`, `...Burst-Capacity`, `...Remaining`을 보고 조절해야 한다.
- 429 발생 시 즉시 반복하지 말고 지수 백오프와 큐 처리가 필요하다.
- 공개 문서의 응답 구조상 0건은 성공 응답의 빈 `lastChangeStatuses`와 `count=0`으로 처리할 수 있으나, 0건 전용 예시는 공개 본문에서 확인하지 못했다. 현재 코드의 정상 빈 배열 처리는 타당하다.

## 12. 부분 취소와 잔여수량

### 공식 필드 의미

- `quantityClaimCompatibility`: 수량 클레임 변경사항에 대한 개발 대응 완료 여부. 대응 완료 시 `true`로 호출한다.
- `quantity`: 공식 최신 스키마에서는 최초 수량으로 설명된다.
- `initialQuantity`: 최초 수량.
- `remainQuantity`: 현재 잔여 수량.
- `initialPaymentAmount`: 최초 결제 금액.
- `remainPaymentAmount`: 잔여 결제 금액.
- `currentClaim`: 현재 진행 중 취소·반품·교환과 요청 수량을 제공한다.
- `completedClaims`: 완료된 수량 클레임 이력을 제공한다.
- 취소 API는 `cancelQuantity`를 지원하며 생략하면 전체 수량 취소다.

### 현재 수량 선택 원칙 판정

`remainQuantity -> quantity -> initialQuantity` 순서는 **일부 일치**다.

- `remainQuantity`를 최우선으로 사용하는 것은 정확하다.
- 최신 공식 스키마에서 `quantity`와 `initialQuantity`는 둘 다 최초 수량 의미이므로 두 폴백의 순서는 실질 차이가 거의 없다.
- `remainQuantity=0`은 null 병합 연산에서 0으로 유지되므로 코드상 1로 되돌아가지는 않는다.
- 다만 발송 후보 생성 단계에서 0 수량과 클레임 상태를 스마트스토어 규격으로 명시적으로 제외하는 로직은 별도 검증이 필요하다.

### 제시된 예시 판정

- 최초 3개, 1개 부분 취소, `remainQuantity=2`, 상태 `PAYED`, `claimType=CANCEL`이라면 주문 수집·출고 준비 수량을 2개로 보는 것은 공식 필드 의미와 일치한다.
- 발송 API 요청에는 수량 필드가 없고 상품주문번호 단위로 발송 처리한다. 따라서 해당 상품주문번호의 **잔여수량 전체**가 처리되는 것으로 해석된다.
- 그러나 공식 공개 문서에는 위 조합을 그대로 든 발송 성공 예시가 없다. 실제 발송 가능 여부는 `claimStatus`, `placeOrderStatus`, 직계약 물류 여부 등도 함께 판단해야 한다.
- 최종 판정: **잔여수량 2개를 후보로 보는 것은 조건부 타당하나, 발송 전 상태 검증과 실제 계정 테스트 필요**.

## 13. 송장등록과 배송처리 API

### 공식 API

- 발송 처리: `POST /external/v1/pay-order/seller/product-orders/dispatch`.
- 한 요청에 상품주문번호 최대 30개.
- 필드: `productOrderId`, `deliveryMethod`, `deliveryCompanyCode`, `trackingNumber`, `dispatchDate`.
- 택배 발송은 `deliveryMethod=DELIVERY`와 네이버 택배사 코드를 사용한다.
- 택배사 코드 목록은 발송 처리 API 스키마에 열거되어 있다. 예: CJ대한통운 `CJGLS`, 롯데택배 `HYUNDAI`, 한진택배 `HANJIN`, 로젠택배 `KGB`, 우체국택배 `EPOST`.
- 응답은 성공 상품주문번호와 실패 상품주문별 코드·메시지를 함께 제공하므로 부분 성공을 처리해야 한다.

### 상태 조건

- 오류 코드에 "상품 주문 상태 확인 필요"와 "발주 상태 확인 필요"가 있으므로 상태 검증이 필수다.
- 일반적으로 결제완료 주문을 발주 확인해 `placeOrderStatus=OK`로 만든 뒤 발송 처리하는 흐름이다.
- 직계약 물류 상품은 판매자 API가 아니라 물류사만 발주·발송할 수 있다는 오류가 있다.
- 취소·반품·교환 완료, 미결제 취소, 이미 배송 완료된 주문은 일반 신규 발송 대상으로 보면 안 된다.
- 공개 발송 API 페이지는 허용 가능한 모든 `productOrderStatus + placeOrderStatus + claimStatus` 조합을 표로 제공하지 않는다. 정확한 조합은 실제 실패 코드와 기술문의로 보완해야 한다.

### 부분수량, 중복, 수정·취소

- 발송 요청에는 수량 필드가 없으므로 같은 상품주문번호를 임의 수량으로 나누어 발송하는 API는 확인되지 않았다.
- 상품주문번호 중복은 `104131`, 기존과 동일한 상태 변경은 `105306`, 사용했거나 유효하지 않은 송장은 `104121/104122` 등으로 실패할 수 있다.
- 재시도할 때는 HTTP 성공 여부만 보지 말고 상품주문별 성공·실패 배열을 저장하고 실패 건만 재시도해야 한다.
- 최신 공개 주문 API 목차에서 일반 발송의 송장 수정 또는 발송 취소 전용 API는 확인하지 못했다. 판매자센터에서 가능한 기능과 API 제공 여부를 네이버에 확인해야 한다.
- 배송 상태는 상품 주문 상세 응답의 `delivery` 구조체(`deliveryStatus`, 택배사, 송장번호 등)로 확인할 수 있다. 별도 일반 배송추적 API는 이번 공개 문서에서 확인하지 못했다.
- 교환 건은 별도 `교환 재배송 처리` API가 있다.

### 현재 엑클로드 판정

- 레지스트리는 `invoice_upload`을 지원한다고 표시하지만 실제 송장 어댑터는 차단 상태다.
- 공식 endpoint와 필드가 확인되었으므로 향후 구현은 가능하지만, 이번 조사에서는 코드 수정이나 API 테스트를 하지 않았다.

## 14. 현재 코드와 공식 문서 비교표

| 조사 항목 | 현재 엑클로드 구현 | 공식 문서 내용 | 판정 | 수정 필요 여부 |
| --- | --- | --- | --- | --- |
| 채널 상태 | 베타·사용 가능 | 내 스토어 앱은 등록 즉시 사용 가능 | 구현되어 있으나 실제 계정 테스트 필요 | 예 |
| 내 스토어/솔루션 구분 | SELF 안내만 있고 장기 솔루션 구조 미표시 | SELF와 SELLER·솔루션마켓 구조가 다름 | 일부 일치 | 예 |
| 인증 방식 | OAuth2 Client Credentials + bcrypt + Base64 | 동일 | 일치 | 아니오 |
| 토큰 요청 Content-Type | form-urlencoded | form-urlencoded 필수 | 일치 | 아니오 |
| 토큰 유효기간 | 응답은 받지만 캐시 없이 매 호출 재발급 | 3시간, 30분 기준 재발급 | 일부 일치 | 예 |
| 401 재인증 | API 호출 fallback 없음 | `GW.AUTHN`이면 토큰 재발급 후 재시도 권장 | 불일치 | 예 |
| 사용자 입력 | 계정명, Client ID, Client Secret, SELF | SELF에는 Client ID/Secret, account_id 불필요 | 일치 | 아니오 |
| 업체명 | 엑클로드 표시 | SELF 등록 필수라는 공개 근거 없음 | 공식 확인 불가 | 예 |
| 서비스 URL | `https://www.excload.com` 표시 | SELF 토큰·주문 API에는 불필요, 등록 화면 필드는 공개 확인 불가 | 일부 일치 | 예 |
| Redirect/Callback | 입력·안내 없음 | SELF에는 불필요 | 일치 | 아니오 |
| 고정 IP | 필수처럼 안내하고 프록시 강제 | 미허용 IP는 403, SELF 입력 세부 규칙은 비공개 | 일부 일치 | 문구 보완 |
| 주문 API 권한 | "주문 조회 등"으로 모호 | 주문 API 그룹 필요 | 일부 일치 | 예 |
| 연결 테스트 | 토큰 발급만 확인 | 토큰 성공과 API 그룹 권한은 별개 | 일부 일치 | 예 |
| 변경 주문 조회 경로 | `last-changed-statuses` | 동일 | 일치 | 아니오 |
| 조회 기준 | 최종 변경 일시 사용 | 최종 변경 일시 | 일치 | 아니오 |
| 24시간 분할 | 항상 24시간 이하 분할 | 종료 생략 시 24시간, 명시 시 최대 상한은 공개 불명 | 일부 일치 | 주석·안내 보완 |
| 7일·30일 분할 | 7·30개 구간 | 보수적 구현 | 구현되어 있으나 실제 계정 테스트 필요 | 아니오 |
| 페이지네이션 | moreFrom/moreSequence | 동일 | 일치 | 아니오 |
| 커서 반복 | 동일 커서면 조용히 중단 | 반복 정상 시나리오 미기재 | 공식 확인 불가 | 예 |
| 상품주문번호 중복 제거 | Set으로 제거 | 경계가 inclusive이고 커서 중복 방지 필요 | 일치 | 아니오 |
| 상세조회 배치 | 300개 | 최대 300개 | 일치 | 아니오 |
| 수량 클레임 옵션 | true | 대응 완료 시 true | 일치 | 아니오 |
| 수량 폴백 | remain -> quantity -> initial | remain은 잔여, quantity·initial은 최초 | 일부 일치 | 설명 보완 |
| 개인정보 | 이름·전화·주소 저장 | 해당 필드 제공, 선물 주문 일부 마스킹 | 일부 일치 | 보존·삭제 정책 확인 |
| Rate Limit | 별도 헤더 기반 조절·429 재시도 없음 | API·앱 단위 동적 제한 | 일부 일치 | 예 |
| 발송 API | 실제 전송 차단 | `/dispatch`, 최대 30개, 상품별 결과 | 코드 미구현 | 예 |
| 택배사 코드 | 공통 코드만 후보에 있음, 네이버 매핑 미확정 | 네이버 전용 코드 필요 | 코드 미구현 | 예 |
| 발송 상태 조건 | 스마트스토어 전용 검증 없음 | 주문·발주·클레임·물류 조건 필요 | 코드 미구현 | 예 |
| 송장 수정·발송 취소 | 미구현 | 공개 문서에서 전용 API 확인 불가 | 공식 확인 불가 | 문의 필요 |

## 15. 사용자용 연결 절차 초안

> 이 절차는 **내 스토어 애플리케이션 SELF 베타**용이다. 커머스솔루션마켓 연결 절차와 혼합하지 않는다.

1. **연결 전에 준비할 것**
   - 스마트스토어가 개설되어 있어야 한다.
   - 해당 스토어의 통합매니저 권한이 필요하다.
   - 엑클로드 호출 IP `54.180.45.46`을 준비한다.
2. **로그인 위치**
   - 네이버 커머스API센터 `https://apicenter.commerce.naver.com`에 접속한다.
   - 스마트스토어 통합매니저 권한이 연결된 커머스 회원으로 로그인한다.
3. **계정 생성**
   - 커머스API센터 계정이 없다면 상단의 `계정생성`을 진행한다.
4. **내 스토어 애플리케이션 이동**
   - `내 스토어 애플리케이션` 메뉴로 이동한다.
   - 세부 버튼명은 `커머스API센터 로그인 후 실제 메뉴명 확인 필요`.
5. **애플리케이션 등록**
   - 자기 스토어용 애플리케이션을 등록한다. 스토어당 최대 1개다.
   - 필요한 API 그룹으로 주문 관련 그룹을 추가한다.
   - 정확한 그룹 선택 문구는 `커머스API센터 로그인 후 실제 메뉴명 확인 필요`.
6. **API 호출 IP**
   - API 호출 IP 입력 영역이 있으면 `54.180.45.46`을 등록한다.
   - 복수 IP 입력 형식과 저장 후 반영 절차는 로그인 화면 안내를 따른다.
7. **입력하지 않아도 되는 항목**
   - SELF 인증에는 Redirect URI와 OAuth Callback URL이 필요하지 않다.
   - `https://www.excload.com`을 입력할 위치가 공식 화면에서 확인되지 않으면 임의 입력하지 않는다.
8. **키 확인**
   - 등록된 애플리케이션의 애플리케이션 ID(Client ID)와 애플리케이션 시크릿(Client Secret)을 확인한다.
   - 실제 메뉴명은 `커머스API센터 로그인 후 실제 메뉴명 확인 필요`.
9. **엑클로드에 입력**
   - 계정명: 판매자가 구분하기 쉬운 이름.
   - Client ID: 애플리케이션 ID.
   - Client Secret: 애플리케이션 시크릿.
   - type은 `SELF`로 자동 고정되므로 별도로 바꾸지 않는다.
10. **저장과 연결 테스트**
    - 먼저 저장한 뒤 `연결 테스트`를 실행한다.
    - 현재 연결 테스트는 토큰 발급까지만 확인하므로, 성공 후 소량 기간으로 주문조회도 확인해야 실제 주문 권한까지 검증된다.
11. **자주 발생할 수 있는 오류**
    - 401: Client ID/Secret, 서명 시각, SELF 유형 또는 토큰 만료 확인.
    - 403 `GW.IP_NOT_ALLOWED`: 등록 IP가 `54.180.45.46`인지 확인.
    - 429: 잠시 기다린 후 재시도. 반복 클릭 금지.
    - 주문조회 권한 오류: 애플리케이션에 주문 API 그룹이 추가됐는지 확인.
    - Client Secret 재발급 후 오류: 엑클로드 저장값도 새 Secret으로 갱신.
12. **사용자가 하지 않아도 되는 작업**
    - 판매자 비밀번호를 엑클로드에 입력하지 않는다.
    - Access Token을 직접 발급하거나 붙여 넣지 않는다.
    - Redirect/Callback 서버를 직접 만들지 않는다.
    - 엑클로드 서버나 프록시를 직접 설정하지 않는다.

## 16. 수정이 필요한 현재 안내

1. **URL 필수 안내 완화**: `https://www.excload.com`을 내 스토어 앱의 필수 입력값처럼 표시하지 말고, 공식 등록 화면에서 해당 필드가 확인될 때만 구체적으로 안내해야 한다.
2. **업체명 구분**: 업체명은 솔루션/개발사 정보와 SELF 앱 정보를 구분해 설명해야 한다.
3. **IP 문구 보완**: "미허용 IP는 호출 불가"와 "내 스토어 화면의 입력 형식·복수 등록은 로그인 확인 필요"를 함께 적어야 한다.
4. **정확한 센터명**: 스마트스토어센터의 예전 `API 연동관리` 경로와 현재 커머스API센터 `내 스토어 애플리케이션` 경로를 혼합하지 않아야 한다.
5. **SELF 정책 경고**: 판매자별 키를 외부 서비스에 저장하는 베타 방식은 네이버 정책 확인 전 제한적 베타임을 명시해야 한다.
6. **연결 테스트 설명**: 현재 테스트는 토큰 발급 확인일 뿐 주문조회 권한·IP·주문 데이터 수집 전체를 보장하지 않는다고 안내해야 한다.
7. **토큰 재사용**: 3시간 유효 토큰을 캐시하고 401 fallback을 구현하는 것이 호출 제한 측면에서 적절하다.
8. **송장 지원 표시**: SSOT의 `invoice_upload` 지원 표시는 실제 어댑터 미구현 상태와 맞지 않으므로 사용자 노출에서는 지원 예정으로 구분해야 한다.
9. **부분취소 안전장치**: `remainQuantity=0`, 진행 중 클레임, 발주 상태, 상품주문 상태를 송장 후보 단계에서 명시적으로 검증해야 한다.
10. **개인정보 안내**: 주문 개인정보 보관 목적·기간·삭제, 연동 해지 시 처리 기준을 확인하고 안내해야 한다.

## 17. 추가 공식 확인 사항

### 판매자 계정 로그인 후 확인

- 내 스토어 애플리케이션 등록의 실제 메뉴명과 버튼명.
- 주문조회·발주확인·발송처리에 필요한 API 그룹의 정확한 화면 표시명.
- 애플리케이션 등록 화면에 서비스 URL 또는 홈페이지 URL 필드가 있는지.
- API 호출 IP가 필수인지, 제한을 끌 수 있는지, 여러 IP를 몇 개까지 등록할 수 있는지.
- IP 변경 시 즉시 반영인지, 앱 재활성화 또는 재승인이 필요한지.
- Client Secret 확인·재발급 메뉴와 기존 Secret의 무효화 시점.

### 네이버 기술문의 필요

- 내 스토어 애플리케이션의 Client ID/Secret을 판매자가 엑클로드 같은 외부 SaaS에 입력·위탁해도 되는지.
- 인증정보 양도·공유·위탁에 적용되는 약관 조항과 필수 보안·동의 조건.
- `lastChangedTo`를 명시했을 때 한 요청의 실제 최대 기간과 조회 가능한 과거 최대 기간.
- 부분 취소 후 `PAYED + remainQuantity>0 + claimType=CANCEL` 조합의 발송 처리 보장 조건.
- 일반 발송 후 송장번호 수정 또는 발송 취소 API 제공 여부.
- 발송 가능한 주문·발주·클레임 상태의 전체 조합.
- 내 스토어 앱에서 사용할 수 있는 별도 테스트 계정 또는 샌드박스 유무.

### 엑클로드 운영 확인

- `54.180.45.46`이 실제 모든 스마트스토어 API 호출의 outbound IP인지.
- 실제 판매자 계정으로 토큰 발급, 주문 API 그룹 권한, 0건·다건·부분취소 주문, 30일 조회를 단계별로 검증할 것.
- 이번 조사에서는 위 테스트를 실행하지 않았다.

## 18. 최종 판정

1. **판매자가 자신의 내 스토어 애플리케이션을 만들어 엑클로드에 연결할 수 있는가?**
   - 기술 규격상 가능하다. 판매자는 Client ID/Secret을 발급할 수 있고 현재 엑클로드 SELF 구현은 토큰 규격과 일치한다.
   - 다만 외부 SaaS에 키를 위탁하는 운영 허용 여부는 네이버 확인이 필요하다.
2. **개인사업자도 가능한가?**
   - 내 스토어 앱은 가능하다. 통합매니저 권한이 전제다.
   - 엑클로드가 솔루션 개발사로 입점하는 것은 현재 국내 법인만 가능하다.
3. **엑클로드 별도 네이버 승인이 필요한가?**
   - 판매자별 SELF 베타의 기술 연결 자체에는 앱별 별도 엑클로드 승인이 공개 절차로 확인되지 않는다.
   - 여러 판매자에게 공식 솔루션으로 제공하려면 엑클로드 개발사 입점과 솔루션 심사가 필요하다.
4. **현재 SELF 베타 방식이 가능한가?**
   - 인증·주문 API 기술 규격상 가능하다. 실제 계정 테스트와 키 위탁 정책 확인 전까지 제한적 베타로 판정한다.
5. **고정 IP는 필수인가?**
   - 허용되지 않은 IP 호출은 차단되므로 엑클로드 outbound IP 등록이 운영상 필수다. SELF 화면의 선택 가능 여부와 복수 IP 규칙은 로그인 확인이 필요하다.
6. **서비스 URL이 필요한가?**
   - SELF 토큰·주문 API에는 필요 없다. 내 스토어 앱 등록 필드로 필요한지는 공개 문서에서 확인되지 않았다.
7. **Redirect 또는 Callback URL이 필요한가?**
   - SELF에는 필요 없다. 솔루션의 심사 후 승인형 커머스ID 인증에서는 Redirect URL이 필요하다.
8. **주문조회가 가능한가?**
   - 가능하며 현재 엑클로드에 구현되어 있다. 24시간 분할의 공식 상한과 과거 조회 한도는 추가 확인이 필요하다.
9. **송장전송이 가능한가?**
   - 네이버 공식 API는 존재한다. 현재 엑클로드 실제 전송은 미구현이다.
10. **종합 판정**
    - **2. 판매자 직접연결 가능하지만 계정 테스트 필요**에 가장 가깝다.
    - 정책 측면에서는 "SELF 키 외부 위탁 허용 여부" 확인 전 조건부다.
    - 장기 공식 방식은 **3. 엑클로드가 사업자 또는 개발사 승인을 받은 후 가능**에 해당한다.

## 19. 공식 출처 목록

확인 날짜는 모두 2026-07-17이다.

| 문서명 | 제공 기관 | URL | 구분 | 확인 내용 | 등급 |
| --- | --- | --- | --- | --- | --- |
| 네이버 커머스API센터 메인·FAQ | 네이버 | https://apicenter.commerce.naver.com/ko/ | 공개 | 통합매니저 가입 조건, API 비용, 솔루션 심사 안내 | 확정 |
| 자주 묻는 질문 | 네이버 | https://apicenter.commerce.naver.com/ko/basic/support/faq | 공개 | 국내 개인·국내사업자, 국내 법인 솔루션 입점, 스토어당 앱 1개, 즉시 사용, 비활성화, 기술문의 경로 | 확정 |
| 커머스API 소개 | 네이버 | https://apicenter.commerce.naver.com/docs/introduction | 공개 | API센터 가입·앱 등록·권한 획득 구조 | 확정 |
| 인증 | 네이버 | https://apicenter.commerce.naver.com/docs/auth | 공개 | Client Credentials, bcrypt, Base64, 서명 원문, 401 fallback | 확정 |
| 인증 토큰 발급 요청 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/exchange-sellers-auth | 공개 | 토큰 URL·필드, SELF/SELLER, account_id, 3시간, 30분, timestamp 5분 | 확정 |
| 제약 사항 | 네이버 | https://apicenter.commerce.naver.com/docs/restriction | 공개 | API 그룹 권한, Rate/Quota Limit, 429, 응답 헤더 | 확정 |
| 문제 해결 | 네이버 | https://apicenter.commerce.naver.com/docs/trouble-shooting | 공개 | `GW.AUTHN`, `GW.IP_NOT_ALLOWED`, `GW.RATE_LIMIT`, Trace ID | 확정 |
| 변경 상품 주문 내역 조회 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-last-changed-status-pay-order-seller | 공개 | 변경일시 기준, 24시간 기본, 300개, moreFrom/moreSequence, 상태·클레임 | 확정 |
| 상품 주문 상세 내역 조회 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-product-orders-pay-order-seller | 공개 | 최대 300개, quantityClaimCompatibility, 수량·금액·개인정보·배송 필드 | 확정 |
| 상품 주문 목록 조회 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-product-order-ids-pay-order-seller | 공개 | 주문번호별 상품주문번호 목록 API | 확정 |
| 발주 확인 처리 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-confirm-placed-product-orders-pay-order-seller | 공개 | 최대 30개 발주확인, 상품별 성공·실패 | 확정 |
| 발송 처리 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-dispatch-product-orders-pay-order-seller | 공개 | `/dispatch`, 최대 30개, 택배사·송장·발송일, 오류 코드 | 확정 |
| 취소 요청 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-request-cancel-pay-order-seller | 공개 | 부분 취소 `cancelQuantity` | 확정 |
| 교환 재배송 처리 | 네이버 | https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-re-delivery-exchange-pay-order-seller | 공개 | 교환 재배송용 별도 API | 확정 |
| 커머스솔루션마켓 소개 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/1000/%EC%BB%A4%EB%A8%B8%EC%8A%A4%EC%86%94%EB%A3%A8%EC%85%98%EB%A7%88%EC%BC%93-%EC%86%8C%EA%B0%9C | 공개 | 구독 판매자 대상 솔루션, 테스트·심사·입점 | 확정 |
| 개발사 입점 동의 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/1000/%EA%B0%9C%EB%B0%9C%EC%82%AC-%EC%9E%85%EC%A0%90-%EB%8F%99%EC%9D%98 | 공개 | 국내 법인 사업자 입점 조건 | 확정 |
| 기본 연동 요소 가이드 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/3000/%EA%B8%B0%EB%B3%B8-%EC%97%B0%EB%8F%99-%EC%9A%94%EC%86%8C-%EA%B0%80%EC%9D%B4%EB%93%9C | 공개 | 솔루션 SELF/SELLER 역할, SELLER account_id, 토큰 유효기간 | 확정 |
| 판매자 커머스 아이디 인증 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/3000/%ED%8C%90%EB%A7%A4%EC%9E%90-%EC%BB%A4%EB%A8%B8%EC%8A%A4-%EC%95%84%EC%9D%B4%EB%94%94-%EC%9D%B8%EC%A6%9D | 공개 | 판매자 구독·동의, JWE Redirect, 기존 대행사 선택 미사용 | 확정 |
| 솔루션 등록 개발사 정보 입력 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/4000/%EC%86%94%EB%A3%A8%EC%85%98-%EB%93%B1%EB%A1%9D-%EA%B0%9C%EB%B0%9C%EC%82%AC-%EC%A0%95%EB%B3%B4-%EC%9E%85%EB%A0%A5 | 공개 | 솔루션 사용연결 URL, API 호출 IP, 앱 ID/Secret, API 그룹, 훅 | 확정 |
| 심사 전 체크리스트 | 네이버 | https://apicenter.commerce.naver.com/docs/solution-doc/5000/%EC%8B%AC%EC%82%AC-%EC%A0%84-%EC%B2%B4%ED%81%AC%EB%A6%AC%EC%8A%A4%ED%8A%B8 | 공개 | 앱 키의 백엔드 보관, 개인정보 보호·해지 삭제, 기존 연결 안내 제외 | 확정 |
| 네이버 공식 커머스API GitHub | 네이버 커머스API | https://github.com/commerce-api-naver/commerce-api | 공식 보조자료 | 기술지원 경로, Secret·토큰·주문 개인정보 공개 금지 | 확정 |
| 사용량 제한 또는 호출량 제한이 있나요? | 네이버 커머스API | https://github.com/commerce-api-naver/commerce-api/discussions/6 | 공식 보조자료 | 내 스토어 앱의 앱별 Rate Limit과 큐 권장 | 확정 |
| 주문 API 질문 | 네이버 커머스API | https://github.com/commerce-api-naver/commerce-api/discussions/1860 | 공식 보조자료 | 발주 상태 변경 기준, 429 호출 제한 | 확정 |

## 20. 공개 문서로 확정하지 못한 항목 요약

- 내 스토어 앱 등록 화면의 서비스 URL·홈페이지 URL 입력란 존재 여부.
- SELF 앱의 IP 입력 필수 여부, IP 제한 해제 가능 여부, 복수 IP 개수, IP 변경 반영·재승인 절차.
- SELF Client Secret을 외부 SaaS에 입력·위탁하는 정책상 허용 범위.
- Client Secret 재발급의 실제 메뉴와 기존 키 무효화 시점.
- 변경내역 API의 명시적 최대 요청 기간과 최대 과거 조회 기간.
- 부분 취소 잔여수량 주문의 발송 성공 상태 조합.
- 일반 발송 송장 수정·발송 취소 전용 API.
- 내 스토어 앱용 샌드박스 또는 테스트 판매자 계정.

## 21. 조사 작업 준수 확인

- 생성한 파일: `docs/order-integration/channel-research/codex/smartstore-api-research.md` 한 개.
- 앱 코드, 기존 MD, UI, API adapter, 환경변수, Prisma, migration, 운영 DB, Vercel 설정은 수정하지 않았다.
- 판매자 계정 로그인, API 연결 테스트, 실제 주문·인증정보 확인은 하지 않았다.
- 전체 테스트, lint, tsc, build를 실행하지 않았다.
- 커밋과 push를 하지 않았다.
