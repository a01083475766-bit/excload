# 쿠팡 API 자동연동 고정 IP 설계

> 작성 기준: 2026-07-03  
> 범위: 쿠팡 API Key 발급 전, 고정 outbound IP 확보 방식과 엑클로드 연동 구조 검토  
> 상태: 설계 초안. 코드는 아직 수정하지 않는다.

---

## 1. 목적

쿠팡 Open API는 Access Key / Secret Key 인증과 함께, 자체개발 방식에서 API 호출 서버의 IP 등록을 요구한다. 엑클로드가 쿠팡 주문을 자동 조회하려면 사용자가 쿠팡 WING에 등록할 **고정 outbound IP**를 먼저 확정해야 한다.

본 문서는 다음 두 방식을 비교한다.

1. Vercel Static IP
2. 별도 고정 IP 프록시 서버(AWS Lightsail 또는 EC2 + Elastic IP)

---

## 2. 결론 요약

| 항목 | Vercel Static IP | AWS 고정 IP 프록시 |
|------|------------------|--------------------|
| 1차 권장도 | 높음 | 중간 |
| 적합한 경우 | 엑클로드가 계속 Vercel 중심으로 운영되고, 월 고정 비용을 감당할 수 있을 때 | Vercel Static IP 비용이 부담되거나, 쿠팡 호출만 별도 네트워크로 격리하고 싶을 때 |
| 예상 비용 | Vercel Pro 이상 + 프로젝트당 월 $100 + Private Data Transfer | Lightsail 약 $5~$12/월부터, 또는 EC2 t4g.nano/micro + IPv4 비용 약 $7~$12/월 이상 |
| 운영 난이도 | 낮음 | 중간~높음 |
| 보안 경계 | Vercel 프로젝트 내부에서 단순 | Vercel ↔ 프록시 간 내부 인증 설계 필요 |
| 장애 대응 | Vercel 단일 운영면 | Vercel과 프록시 양쪽 모니터링 필요 |
| 추천 판단 | 운영 단순성이 중요하면 우선 검토 | 비용 최소화가 중요하면 검토 |

현재 엑클로드 구조에서는 **Vercel Static IP가 가장 단순한 1순위**다. 다만 비용 부담이 크면 **Lightsail 고정 IP 프록시**가 현실적인 2순위다.

---

## 3. 현재 엑클로드 Vercel 플랜에서 Static IP 사용 가능 여부

저장소에는 `vercel.json`이 있고, 현재 배포 구조는 GitHub → Vercel 기반으로 보인다. 다만 **현재 Vercel 계정/팀 플랜은 코드 저장소만으로 확정할 수 없다.**

확인 위치:

1. Vercel Dashboard 접속
2. 엑클로드 프로젝트 선택
3. Team / Project Settings에서 현재 플랜 확인
4. Project Settings → Networking 또는 Connectivity에서 Static IPs 메뉴 확인

판단 기준:

| 현재 플랜 | Static IP 사용 가능성 |
|-----------|----------------------|
| Hobby | 사용 불가 |
| Pro | 사용 가능. 유료 add-on |
| Enterprise | 사용 가능. Static IP 또는 Secure Compute 검토 가능 |

따라서 다음 단계에서 먼저 확인할 것은 **엑클로드 Vercel 팀이 Pro 이상인지**다.

---

## 4. Vercel Static IP 방식

### 4.1 구조

```text
엑클로드 사용자
  → 엑클로드 Vercel API Route
  → Vercel Static IP outbound
  → 쿠팡 Open API
```

쿠팡 WING에는 Vercel이 제공하는 Static IP 주소를 등록한다. 엑클로드 서버 API Route에서만 쿠팡 API를 호출하고, 브라우저에서는 쿠팡 Access Key / Secret Key를 직접 사용하지 않는다.

### 4.2 예상 비용

공개 문서 기준:

| 항목 | 비용 |
|------|------|
| Vercel Pro 기본 | 사용자당 월 $20부터 |
| Static IPs | 프로젝트당 월 $100 |
| Private Data Transfer | 지역별 GB당 과금. 문서상 $0.15/GB부터 언급 |

즉, 이미 Pro를 사용 중이라면 쿠팡 자동연동을 위해 **월 $100 + 전송량 비용**이 추가된다. Hobby라면 Pro 전환 비용까지 포함해서 봐야 한다.

### 4.3 설정 위치

Vercel Dashboard 기준:

1. Project 선택
2. Settings
3. Networking 또는 Connectivity
4. Static IPs 활성화
5. Active Region 선택
6. 할당된 static outbound IP 확인
7. 쿠팡 WING 자체개발 IP 주소에 등록

주의:

- Vercel Static IP는 inbound 고정 IP가 아니라 **outbound egress IP**다. 쿠팡 API 호출에는 이 방식이 맞다.
- Edge Runtime / Middleware를 통해 호출하면 Static IP 경로를 타지 않을 수 있다. 쿠팡 호출은 **Node.js Runtime의 서버 API Route**에서 처리한다.
- 프로젝트 단위로 적용되므로 쿠팡 호출뿐 아니라 해당 프로젝트의 outbound traffic이 같이 영향을 받는다.

### 4.4 장단점

| 기준 | 평가 |
|------|------|
| 비용 | 월 $100 이상으로 프록시 서버보다 높음 |
| 운영 난이도 | 가장 낮음. 별도 서버 패치/배포/모니터링 부담이 적음 |
| 보안 | Secret을 Vercel 서버와 DB 암호화 계층 안에만 두면 구조가 단순함 |
| 장애 대응 | Vercel 로그/배포/알림 중심으로 단일화 가능 |
| 확장성 | 쿠팡 외 IP allowlist가 필요한 외부 API에도 재사용 가능 |

---

## 5. AWS 고정 IP 프록시 서버 방식

### 5.1 구조

```text
엑클로드 사용자
  → 엑클로드 Vercel API Route
  → AWS 프록시 서버
  → 고정 public IP
  → 쿠팡 Open API
```

쿠팡 WING에는 AWS 프록시 서버의 고정 IP를 등록한다. Vercel은 쿠팡을 직접 호출하지 않고, 프록시 서버의 내부 API를 호출한다.

### 5.2 Lightsail 예상 비용

Lightsail은 작은 프록시 서버를 가장 단순하게 둘 수 있는 방식이다.

| 항목 | 예상 비용 |
|------|-----------|
| Lightsail Linux 인스턴스 | 약 $5/월부터 |
| 더 여유 있는 소형 인스턴스 | 약 $7~$12/월 범위 |
| Static IPv4 | 실행 중인 인스턴스에 붙어 있으면 추가 비용 없음 |
| 미연결 static IP | 시간당 $0.005 과금 가능 |
| 데이터 전송 | 기본 제공량 초과 시 지역별 과금 |

쿠팡 주문조회 프록시는 CPU 부하가 크지 않으므로 초기에는 $5~$7/월급 인스턴스로도 시작 가능하다. 다만 Node.js 서버, HTTPS, 로그, 배포, 장애 복구를 직접 관리해야 한다.

### 5.3 EC2 + Elastic IP 예상 비용

서울 리전 `ap-northeast-2`의 소형 ARM 인스턴스 기준 대략:

| 항목 | 예상 비용 |
|------|-----------|
| EC2 `t4g.nano` | 약 $3.8/월 |
| EC2 `t4g.micro` | 약 $7.6/월 |
| Public IPv4 / Elastic IP | 시간당 $0.005, 약 $3.6/월 |
| EBS | 용량별 별도 과금 |
| 데이터 전송 | 사용량별 별도 과금 |

따라서 EC2는 가장 작게 잡아도 대략 **월 $7~$12 이상**을 예상한다. 운영을 조금 안정적으로 잡으면 Lightsail보다 구성 요소가 많아질 수 있다.

### 5.4 장단점

| 기준 | 평가 |
|------|------|
| 비용 | Vercel Static IP보다 저렴하게 시작 가능 |
| 운영 난이도 | 서버 보안 패치, 프로세스 관리, 배포, 로그 수집 필요 |
| 보안 | Vercel ↔ 프록시 간 인증 계층을 별도 설계해야 함 |
| 장애 대응 | Vercel 장애와 프록시 장애를 분리해서 봐야 함 |
| 확장성 | 쿠팡 호출만 독립적으로 분리 가능. 추후 여러 외부 API 프록시로 확장 가능 |

---

## 6. 프록시 서버 사용 시 인증 구조

프록시 서버는 public internet에 노출되므로, 단순히 URL만 숨기는 방식은 금지한다.

권장 인증:

```text
Vercel 서버
  - 요청 본문 생성
  - timestamp + method + path + bodyHash를 HMAC 서명
  - x-excload-proxy-timestamp
  - x-excload-proxy-signature
  - x-excload-proxy-key-id

AWS 프록시
  - timestamp 허용 범위 확인
  - bodyHash 재계산
  - HMAC signature 검증
  - 중복 nonce 또는 requestId 차단
  - 검증 성공 시에만 쿠팡 API 호출
```

필수 조건:

| 항목 | 방침 |
|------|------|
| 전송 | HTTPS만 허용 |
| 인증 | 공유 비밀 기반 HMAC-SHA256 또는 비대칭 서명 |
| 재전송 방지 | timestamp 5분 이내 + requestId/nonce 저장 |
| 접근 제한 | 가능하면 프록시 방화벽에서 관리용 SSH IP 제한 |
| 로그 | Access Key / Secret Key / 쿠팡 Authorization 헤더 기록 금지 |
| 실패 응답 | 상세 Secret 관련 정보 노출 금지 |

프록시 방식에서 Vercel outbound IP가 동적이면 프록시의 IP allowlist만으로 Vercel을 제한하기 어렵다. 따라서 프록시 인증은 반드시 애플리케이션 레벨 HMAC으로 처리한다.

---

## 7. Access Key / Secret Key 암호화 저장 방식

쿠팡 Access Key와 Secret Key는 사용자별 민감 정보다. 브라우저나 로그에 노출하지 않고, 서버에서 암호화 저장한다.

권장 방식:

| 항목 | 방침 |
|------|------|
| 암호화 알고리즘 | AES-256-GCM |
| 마스터 키 | `COUPANG_CREDENTIAL_ENCRYPTION_KEY` 환경 변수 |
| 키 형식 | 32바이트 random 값을 base64로 저장 |
| IV | 행마다 12바이트 random IV 생성 |
| 저장값 | ciphertext + iv + authTag + keyVersion |
| 복호화 위치 | 쿠팡 API 호출 직전 서버에서만 |
| 로그 | 평문, ciphertext 원문, Authorization 헤더 모두 로그 금지 |
| 키 교체 | `keyVersion`을 두고 신규 저장분부터 새 키 적용. 기존 값은 점진 재암호화 |

Access Key도 공개 정보로 취급하지 않는다. Secret Key와 함께 암호화 저장한다. UI에는 마지막 4자리 또는 마스킹된 형태만 표시한다.

프록시 서버 방식에서 Secret 복호화 위치는 두 가지 중 하나로 결정해야 한다.

| 방식 | 설명 | 평가 |
|------|------|------|
| Vercel에서 복호화 후 프록시에 전달 | 프록시는 쿠팡 호출만 수행 | 구조는 단순하지만 프록시 요청에 민감 정보가 지나감 |
| 프록시에서 복호화 | 프록시가 DB 또는 별도 secret store 접근 | 보안 경계는 명확하지만 운영 복잡도 증가 |

초기에는 **Vercel에서 복호화하고, 프록시에는 HMAC으로 보호된 내부 요청을 보내는 방식**이 현실적이다. 단, 프록시 요청 본문에도 Secret Key가 포함되므로 HTTPS, HMAC, 로그 금지, 짧은 타임아웃을 강제한다.

보안을 더 강화하려면 AWS KMS 또는 Secrets Manager를 붙이고, 프록시가 vendor connection id만 받아 직접 복호화하도록 바꾼다.

---

## 8. 사용자별 쿠팡 연결 정보 DB 모델 초안

Prisma 모델 초안:

```prisma
enum MarketplaceProvider {
  COUPANG
}

enum MarketplaceConnectionStatus {
  PENDING
  ACTIVE
  ERROR
  DISABLED
}

model MarketplaceConnection {
  id                    String   @id @default(cuid())
  userId                String
  provider              MarketplaceProvider

  vendorId              String
  accessKeyCiphertext   String   @db.Text
  accessKeyIv           String
  accessKeyAuthTag      String
  secretKeyCiphertext   String   @db.Text
  secretKeyIv           String
  secretKeyAuthTag      String
  encryptionKeyVersion  Int      @default(1)

  status                MarketplaceConnectionStatus @default(PENDING)
  lastTestedAt          DateTime?
  lastSuccessAt         DateTime?
  lastErrorCode         String?
  lastErrorMessage      String?  @db.Text

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider, vendorId])
  @@index([userId, provider])
}
```

정책:

- 한 사용자가 여러 쿠팡 업체코드를 연결할 수 있는 가능성을 열어 둔다.
- 초기 UI에서는 1개 연결만 허용하더라도 DB는 `vendorId` 기준 확장 가능하게 둔다.
- `lastErrorMessage`에는 쿠팡 응답 전문을 저장하지 않고, 사용자 안내 가능한 요약만 저장한다.
- Secret 원문은 절대 저장하지 않는다.

---

## 9. 쿠팡 주문 JSON 변환 위치

쿠팡 API 응답은 엑셀처럼 헤더를 추론할 필요가 없는 구조화 JSON이다. 따라서 AI/헤더 매핑에 의존하지 않고, 서버 어댑터에서 결정적으로 매핑한다.

권장 위치:

```text
app/lib/coupang/
  client.ts                  # 쿠팡 HMAC 인증 fetch 클라이언트
  credentials.ts             # 암호화/복호화
  orders.ts                  # 주문조회 도메인 함수
  map-coupang-order.ts       # 쿠팡 주문 JSON 1건 → 기준헤더 row
  map-coupang-orders.ts      # 쿠팡 주문 JSON 목록 → OrderStandardFile
```

권장 흐름:

```text
쿠팡 주문 JSON
  → mapCoupangOrdersToOrderStandardFile()
  → OrderStandardFile
  → runMergePipeline()
  → 미리보기 / 묶음처리 / 다운로드
```

이 방식의 장점:

- 쿠팡 필드명이 바뀌지 않는 한 결과가 안정적이다.
- 헤더 매핑 AI 호출 비용과 불확실성을 피한다.
- 기존 Stage3 입력 타입인 `OrderStandardFile`을 그대로 사용한다.
- 기준헤더는 내부 전용으로 유지되고 UI에 노출하지 않는다.

대안으로 쿠팡 JSON을 `CleanInputFile`로 만든 뒤 기존 `/api/order-pipeline`에 태울 수도 있다. 하지만 쿠팡 API는 스키마가 알려진 구조이므로, 장기적으로는 직접 `OrderStandardFile` 생성이 더 안전하다.

---

## 10. 기존 미리보기·묶음처리·다운로드 재사용 방식

현재 엑클로드의 핵심 후단 흐름은 다음 구조다.

```text
OrderStandardFile
  + TemplateBridgeFile
  + FixedInput
  → runMergePipeline()
  → PreviewRows
  → 미리보기
  → 묶음처리/정렬
  → 택배사 양식 다운로드
```

쿠팡 자동연동은 주문 입력 단계만 바꾼다.

```text
기존 엑셀 업로드:
  엑셀 파일 → CleanInputFile → Stage2 → OrderStandardFile

쿠팡 자동연동:
  쿠팡 API JSON → Coupang Adapter → OrderStandardFile
```

그 이후는 동일하게 유지한다.

재사용 대상:

| 기능 | 재사용 방식 |
|------|-------------|
| 미리보기 | `runMergePipeline()` 결과의 `previewRows`를 기존 상태/컴포넌트에 주입 |
| 고정 입력 | 기존 `fixedHeaderValues`를 그대로 Stage3에 전달 |
| 택배사 양식 | 기존 `TemplateBridgeFile`과 `courierHeaders` 사용 |
| 묶음처리/정렬 | 기존 preview row 기반 처리 로직 재사용 |
| 다운로드 | 기존 택배사 양식 다운로드 로직 재사용 |

주의:

- 쿠팡 주문조회 결과에는 주문 상태가 포함되므로, 처음에는 배송 준비가 필요한 상태만 가져오는 필터를 둔다.
- 쿠팡의 묶음배송번호, 상품주문번호, 노출상품ID, 도서산간 배송비 등은 이미 기준헤더에 대응 가능한 확장 필드가 있다.
- 쿠팡 주문 1건에 상품 라인이 여러 개면 엑클로드 출력 단위는 "배송/출고에 필요한 행" 기준으로 정해야 한다. 초기 설계는 **상품주문번호 또는 배송 단위별 1행**을 기본으로 둔다.

---

## 11. 쿠팡 API Key 발급 가이드와 고정 IP의 관계

고정 IP가 확정된 후 사용자 안내 문서에 들어갈 내용:

| 항목 | 안내 |
|------|------|
| 발급 위치 | 쿠팡 WING → 판매자 정보 또는 추가판매정보 → Open API Key 발급 |
| 발급 방식 | 자체개발(직접입력) |
| 업체명 | 엑클로드 또는 원클 |
| URL | 엑클로드 서비스 URL |
| IP 주소 | Vercel Static IP 또는 AWS 프록시 고정 IP |
| 입력받을 값 | 업체코드, Access Key, Secret Key |
| 반영 지연 | IP/연동정보 변경 후 최대 30분 정도 대기 가능 |
| 제한 | IP는 최대 10개까지 등록 가능. 연동정보 수정 횟수 제한에 유의 |

키 발급은 IP가 확정된 뒤 진행한다. 현재 단계에서는 키 발급을 진행하지 않는다.

---

## 12. 장애 대응 비교

| 상황 | Vercel Static IP | AWS 프록시 |
|------|------------------|------------|
| 쿠팡 403 Not allowed IP | Vercel Static IP가 WING에 정확히 등록됐는지 확인 | 프록시 Elastic IP/Lightsail Static IP가 등록됐는지 확인 |
| 쿠팡 HMAC 오류 | Vercel 서버 시간, path/query 서명 문자열 확인 | 프록시에서 만든 쿠팡 서명 문자열 확인 |
| 주문조회 타임아웃 | Vercel Function timeout과 쿠팡 응답 시간 확인 | Vercel→프록시, 프록시→쿠팡 양쪽 timeout 확인 |
| Secret 복호화 실패 | Vercel 환경변수와 keyVersion 확인 | 복호화 위치에 따라 Vercel 또는 프록시 secret store 확인 |
| 프록시 서버 다운 | 해당 없음 | health check, process manager, 재시작, 인스턴스 상태 확인 |
| 배포 후 IP 변경 | Static IP 설정 유지 여부 확인 | Elastic IP/Static IP가 새 인스턴스에 재연결됐는지 확인 |

프록시 방식을 선택하면 최소한 다음이 필요하다.

- `/healthz` 엔드포인트
- 프로세스 자동 재시작(systemd, pm2 등)
- 서버 로그 로테이션
- SSH 접근 제한
- OS 보안 업데이트 절차
- Vercel 쪽 timeout/retry 정책

---

## 13. 구현 단계 제안

### 13.1 IP 구조 확정 전

1. Vercel 현재 플랜 확인
2. Vercel Static IP 비용 승인 여부 결정
3. 비용 부담 시 Lightsail/EC2 프록시 방식 확정
4. 쿠팡 WING에 등록할 최종 IP 목록 확정

### 13.2 IP 확정 후

1. 사용자 발급 가이드 작성
2. 쿠팡 연결 정보 DB 모델 추가
3. 암호화 유틸리티 추가
4. 쿠팡 API 클라이언트 추가
5. 테스트 연결 API 추가
6. 주문조회 API 추가
7. 쿠팡 주문 JSON → `OrderStandardFile` 어댑터 추가
8. 기존 Stage3/미리보기/다운로드 흐름 연결

---

## 14. 최종 추천

운영 단순성과 장애 대응을 우선하면 **Vercel Static IP**를 선택한다. 월 비용이 부담되면 **Lightsail 고정 IP 프록시**를 선택한다.

초기 권장 의사결정:

```text
Vercel Pro 이상이고 월 $100 추가 비용 가능
  → Vercel Static IP

월 $100 비용이 부담됨
  → AWS Lightsail + Static IP 프록시

강한 격리, 기업 보안, VPC 피어링 필요
  → Vercel Secure Compute 또는 AWS 전용 백엔드 재검토
```

현재 엑클로드에는 Vercel 중심 구조와 기존 Stage2/Stage3 파이프라인이 있으므로, 1차로는 **Vercel Static IP 가능 여부와 비용 승인 여부**를 먼저 확인한다.
