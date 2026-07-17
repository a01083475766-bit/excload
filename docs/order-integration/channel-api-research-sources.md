# 채널 API 조사 출처 (근거 보관)

> **문서 목적**: 채널별 **공식 출처·확인 날짜**를 보관하고, 공식 공개 문서와 로그인 전용 문서, 제3자(보조) 자료를 구분한다. API 정책 변경 시 재조사용 기록.
> **확인 날짜 기준**: 2026-07-17 (별도 표기 없으면 동일)
> **연관**: [channel-api-access-matrix.md](./channel-api-access-matrix.md) · [channel-user-setup-guides.md](./channel-user-setup-guides.md)

## 출처 구분 범례

| 구분 | 의미 |
|------|------|
| **공식-공개** | 로그인 없이 접근 가능한 쇼핑몰 공식 API/개발자 문서·공지 |
| **공식-로그인** | 공식 문서지만 판매자/개발자 로그인 후에만 상세 확인 가능 |
| **보조-제3자** | 셀러툴·연동사·블로그 등 제3자 자료(참고용, 단독 확정 금지) |

## 미확정 표기 규칙

- 공식 공개 문서에서 확인 불가
- 판매자 계정 로그인 후 확인 필요
- 담당 MD 또는 API 운영팀 문의 필요
- 제3자 자료에서만 확인되어 미확정

---

## 1. 쿠팡 (`coupang`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| Coupang Open API — API Key 발급 | developers.coupangcorp.com/hc/ko/sections/…API-Key-발급 | 공식-공개 | 판매자ID당 키 1개, 연동업체/자체개발 택1, 자체개발 시 IP 최대 10개 | 확정 |
| 쿠팡 API 발급방법(가비아 블로그) | apellido.tistory.com | 보조-제3자 | 자체개발 선택 시 업체명·URL·IP 입력, 2023-07-10 이후 신규는 자체개발 | 조건부 |
| 윈들리 쿠팡 연결 가이드 | guide.windly.cc | 보조-제3자 | 연동업체 선택 vs 자체개발 화면 흐름, 병행 시 IP 확보 | 조건부 |

- **핵심 근거**: "쿠팡 URL 필요"는 **자체개발(직접입력) 방식 한정**. 연동업체 선택 시 IP·URL 불요.
- **미확정/추가확인**: 테스트/샌드박스 존재 여부 — 공식 문서 추가 확인 필요.

## 2. 스마트스토어 (`smartstore`) — 커머스API

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 커머스API센터 공지 — 내스토어 애플리케이션 안내 | notice.naver.com/notices/cac/16929 | 공식-공개 | 내스토어 앱 등록 필수, 통합매니저 권한, ID/시크릿 발급 (공지 문구는 "스토어별 앱 최대 3개"이나 **화면 직접 확인 결과 최대 3개는 API 호출 IP 개수** — 재확인 권장) | 조건부 |
| 커머스API — 인증(전자서명) | apicenter.commerce.naver.com/docs/auth | 공식-공개 | OAuth2 client_credentials, 전자서명 bcrypt(client_id_timestamp, salt=client_secret)→Base64 | 확정 |
| 커머스API — 인증 토큰 발급 요청 | apicenter.commerce.naver.com/docs/commerce-api/current/exchange-sellers-auth | 공식-공개 | 토큰 3시간, 리소스별 1토큰 | 확정 |
| GitHub Discussion #3460 | github.com/commerce-api-naver/commerce-api/discussions/3460 | 공식-공개(운영팀 답변) | Content-Type은 x-www-form-urlencoded, API 호출 IP 등록 사례, SELF/SELLER | 조건부 |
| GitHub Discussion #780 | github.com/commerce-api-naver/commerce-api/discussions/780 | 공식-공개 | 내스토어 앱=SELF, 솔루션 앱=SELF/SELLER | 확정 |

- **미확정/추가확인**: API 호출 IP **필수 여부**(등록 항목은 존재), 주문 판매자 API의 정확한 권한명 — 로그인/화면 확인 필요.

## 3. 네이버 커머스솔루션마켓 (솔루션 경로)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 커머스솔루션마켓 소개 | apicenter.commerce.naver.com/docs/solution-doc/1000/커머스솔루션마켓-소개 | 공식-공개 | 커머스API로 솔루션 제작 → 테스트 > 심사 > 입점 | 확정 |
| 개발사 입점 동의 | apicenter.commerce.naver.com/docs/solution-doc/1000/개발사-입점-동의 | 공식-공개 | 입점동의 완료 개발사만 솔루션 등록·판매, 국내 법인 사업자만(24.10) | 확정 |
| 기본 연동 요소 가이드 | apicenter.commerce.naver.com/docs/solution-doc/3000/기본-연동-요소-가이드 | 공식-공개 | SELF(솔루션 시스템)·SELLER(구독 판매자, account_id) 토큰 payload | 확정 |

## 4. 11번가 (`eleven`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 11번가 OPEN API 개발가이드 | openapi.11st.co.kr/openapi/OpenApiGuide.tmall | 공식-공개 | 32자리 key, `openapikey` 헤더, 에러코드(unregisteredKey/overedTraffic/accessDeny) | 확정 |
| 11번가 상품등록 안내 PDF | cdn.011st.com/…/11st_down_14136.pdf | 공식-공개 | OPEN API CENTER 서비스 등록, Seller API 정보수정 | 조건부 |
| CJ대한통운 11번가 연동 가이드 | docs.channel.io/cjlogistics/… | 보조-제3자 | 셀러오피스 최하단 OpenAPI 버튼, 접속권한>셀링툴 업체 선택 | 조건부 |

- **미확정/추가확인**: 주문 조회용 Seller API의 **셀링툴 업체 선택 필수 여부**, **IP 등록 요건** — 셀러오피스 로그인/문의 확인 필요.

## 5. 카페24 (`cafe24`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 카페24 Authentication/Security Guide | developer.cafe24.com/docs/guide/authentication_security_guide.html | 공식-공개 | OAuth2 Authorization Code, authorize→token, Basic 헤더, scope | 확정 |
| 카페24 REST API Docs (Admin) | developers.cafe24.com/docs/api/admin/ | 공식-공개 | access/refresh 토큰, mall.read_order 등 | 확정 |
| cafe24 template app | github.com/cafe24github/cafe24-template-app | 공식-공개 | 개발자센터 앱 등록 → CLIENT_ID/SECRET, scope 매칭 | 확정 |
| 비개발자 카페24 API 토큰 발급(블로그) | seheeopark.rbind.io | 보조-제3자 | App URL·Redirect URI 등록, mall.read_order 포함 | 조건부 |

- **미확정/추가확인**: 엑클로드 단일 앱스토어 앱 전환 시 심사 요건(현재 베타는 판매자 앱).

## 6. 롯데ON (`lotteon`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 롯데ON API 센터 — API 가이드 | api.lotteon.com/apiGuide/ | 공식-공개 | 판매자정보>OpenAPI관리, 서버 IP 등록/셀러툴 선택 후 키발급, 인증키 1년, 1분 10,000회 | 확정 |
| 윈셀링 롯데온 API 세팅(가이드) | winselling.co.kr/guide/… | 보조-제3자 | 정보설정 탭 절차, 호스팅/셀러툴 선택, 1년 재발급 | 조건부 |
| 롯데ON 연동 가이드(큐익스프레스) | qxguide.oopy.io | 보조-제3자 | 연동방법 호스팅/셀러툴·직접입력, 서버 IP `;` 구분 | 조건부 |

## 7. SSG.COM (`ssg`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| SSG 파트너오피스 API 관리 | po.ssgadm.com | 공식-로그인 | API 회원정보·인증키 발급, 운영/테스트 서버 IP 등록 | 조건부 |
| 윈셀링 SSG API 세팅(가이드) | winselling.co.kr/guide/… | 보조-제3자 | 입점·MD 승인, API 관리>API 계정정보>인증키/사용자 ID | 조건부 |
| 아르고/플토/아웃박스 SSG 연동 | guide.argoport.com, plto.com, guide.ourbox.co.kr | 보조-제3자 | 운영/테스트 서버 IP 등록 + 이메일 인증, 인증상태 '인증' 필요 | 조건부 |

- **미확정/추가확인**: eAPI 엔드포인트·조회기간 상세, MD 승인 절차 — 파트너오피스 로그인/문의 필요.

## 8. NHN커머스/샵바이 (`shopby`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 샵바이 server API 문서 | server-docs.shopby.co.kr | 공식-공개 | server API, 인증 토큰+시스템 키, Token Bucket 1초 100회 | 확정 |
| NHN커머스 워크스페이스 도움말 — server API 호출방법 | workspace-help.nhn-commerce.com/contents/faq/server-api-1 | 공식-공개 | systemKey(셀러어드민 앱), mallKey(서비스어드민 외부 연동키), 2방식 | 확정 |
| 샵바이 엔터프라이즈 매뉴얼 — 개발 연동 정보 | nhn-commerce.gitbook.io/shopby_enterprise_manual | 공식-공개 | 클라이언트 아이디/외부 연동키 정의 | 확정 |

## 9. 고도몰 (`godomall`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 고도몰 개발자센터 | devcenter.godo.co.kr | 공식-로그인 | 제휴사(partner_key) 등록, 쇼핑몰별 user key 신청 | 미확정 |
| (SSOT 내부 기록) mall-integration-specs.ts | 레포 | 내부 | Order_Search.php POST XML, Token Bucket 1초 100회 429, openhub host | 조건부 |

- **미확정/추가확인**: openhub 호출 IP 허용 절차, user key 승인 흐름 — devcenter 로그인/NHN 1:1 문의 필요.

## 10. 메이크샵 (`makeshop`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| 메이크샵 개발자센터 — 개발 정보 관리 | developer.makeshop.co.kr/docs/guide/app/dev-info | 공식-공개 | OIDC/OAuth2.1, APP URL·접근 허용 IP(최대 10) 필수, Client ID/Secret 자동 생성 | 확정 |
| 액세스 토큰 발급 | developer.makeshop.co.kr/docs/guide/app/access-token | 공식-공개 | client_credentials, Basic 헤더, shop_uid+IP 1분 5회, 토큰 5분 | 확정 |
| 주문 2.0 조회 | developer.makeshop.co.kr/docs/api/order/get-order-2 | 공식-공개 | `GET /api/v1/:shopId/order/2`, 30일·1000건 제한 | 확정 |
| 심사 요청하기 / APP 출시 흐름 | developer.makeshop.co.kr/docs/guide/app/review · overview | 공식-공개 | 심사 영업일 5~10일, 파트너 승인 전 개발·테스트 가능 | 확정 |

## 11. CJ온스타일 (`cjonstyle`)

| 출처 문서명 | URL | 구분 | 핵심 근거 | 등급 |
|-------------|-----|------|-----------|:---:|
| CJ온스타일 파트너 표준 API 가이드 | partners.cjonstyle.com/standardApi/apiGuide | 공식-로그인 | vendorCode+authenticationKey, 직접개발+운영 IP | 미확정 |

- **미확정/추가확인**: 표준 API Path(현재 SSOT placeholder), 조회 기간·호출 제한, 입점 협력사 자격 — 파트너 로그인/문의 필요.

## 12. 문의·승인 필요 direct (SSOT 기록 기반)

| 채널 | 대표 출처(예정) | 구분 | 상태 |
|------|----------------|------|------|
| G마켓/옥션(ESM) | etapi.gmarket.com, `etapihelp@gmail.com` | 공식-로그인/문의 | 제휴 승인 대기 |
| 지그재그 | zigzag.kr/_openapi, 카카오스타일 MD | 공식-로그인/문의 | 헤더명·키 확정 전 |
| 카카오톡스토어 | kapi.kakao.com, 카카오쇼핑 Open API | 공식-로그인/문의 | 연동대행사 계약 전 |
| 텐바이텐 | api.10x10.co.kr, kobula@10x10.co.kr | 문의 | SCM 문의 전 |
| 도매꾹 | openapi.domeggook.com | 공식-로그인/문의 | Private API 승인 전 |
| 큐텐 | api.qoo10.jp (QSM) | 문의 | 연동회사명 신청 전 |
| 무신사 | 파트너센터 | 문의 | host/스키마 미확인 |
| 에이블리 | (개발자 포털 없음) | 문의 | host 미확정 |

> 위 8개 채널은 **담당 MD 또는 API 운영팀 문의 필요** 상태. 개별 문의 초안은 `zigzag-md-inquiry.md`, `esm-gmarket-auction-inquiry.md`, `kakao-talkstore-inquiry.md` 참고.

## 13. Shopify (`shopify`)

| 출처 문서명 | URL | 구분 | 상태 |
|-------------|-----|------|------|
| Shopify Admin API / Partners | shopify.dev | 공식-공개 | 구현 예정(다음 API 후보) — 이번 조사 범위 밖 상세 |

---

## 재조사 필요 항목 요약 (다음 라운드)

1. 스마트스토어 API 호출 IP **필수 여부**, 주문 판매자 API 정확 권한명 (커머스API센터 로그인). **애플리케이션 수 vs API 호출 IP 수(각 최대 3개?)** — 공지 문구와 화면 직접 확인이 상충하므로 재확인
2. 11번가 셀링툴 업체 선택 필수 여부·IP 요건 (셀러오피스)
3. SSG eAPI 엔드포인트·조회기간·MD 승인 절차 (파트너오피스)
4. CJ온스타일 표준 API Path 확정 (파트너 Docs 로그인)
5. 고도몰 openhub 호출 IP 허용·user key 승인 절차 (devcenter/NHN 문의)
6. 각 채널 테스트/샌드박스 존재 여부
7. 문의·승인 8개 채널 회신 결과
