# 송장전송 — 테스트 DB migration / Prisma 검증 Runbook (D-6g-b)

> **상태**: 안전장치·절차 문서 (2026-07-11) — **이번 단계에서 migrate 실행 안 함**  
> **단계**: D-6g-b  
> **목적**: 운영 DB 오접속을 차단한 뒤, **기존 smoke 테스트 DB**에만 송장전송 migration을 적용하고 Prisma repository를 검증하기 위한 preflight·절차  
> **관련**  
> - `scripts/check-shipment-transmission-test-db-env.mjs`  
> - `scripts/lib/shipment-transmission-test-db-guard.mjs`  
> - `.env.smoke.local.example`  
> - `prisma/migrations/20260710230000_add_shipment_transmission_attempts/`  
> - [shipment-api-transmission-design.md](./shipment-api-transmission-design.md)

**이 문서는 절차·경고만 다룹니다.**  
D-6g-b에서 하지 않는 것: DB 접속, `prisma migrate deploy`, fixture/cleanup 실행, Vercel/Supabase 설정 변경, 커밋·push.

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | smoke 테스트 DB에 송장전송 schema를 **안전하게** 적용·검증하기 위한 guard + runbook |
| 왜 | `build:vercel`이 Production에서 `migrate deploy`를 돌릴 수 있고, 로컬 shell의 `DATABASE_URL`이 운영을 가리킬 수 있음 |
| 무엇이 아님 | 쇼핑몰 API 송장전송, 운영 DB 수동 migrate, UI/API 구현 |

---

## 2. ⚠️ Vercel 자동 migration 경고 (확인됨)

### 레포 사실

| 항목 | 내용 |
|------|------|
| `package.json` → `build:vercel` | `prisma generate && prisma migrate deploy && next build` |
| `package.json` → `build` | `prisma generate && next build` (**migrate 없음**) |
| `vercel.json` | cron만 — **Build Command를 알 수 없음** |
| GitHub Actions | 없음 — push만으로 migrate 되지 않음 |
| migration 커밋 | `20260710230000_add_shipment_transmission_attempts` 는 **main에 포함됨** |

### 사용자 확인 결과 (Production 배포 `6616521`)

| 확인 항목 | 결과 |
|-----------|------|
| Build Command | `npm run build:vercel` (Override 켜짐) |
| Build Logs | `prisma migrate deploy` 실행됨 |
| 송장전송 migration | **`20260710230000_add_shipment_transmission_attempts` Production DB에 적용 완료** |

**의미**

- 운영(Production) DB에는 이미 Attempt 테이블·enum 확장이 **적용된 상태**입니다.
- 이후 D-6g-c는 **테스트(smoke) DB**에 동일 migration을 적용·검증하는 단계입니다 (운영 재적용이 목표가 아님).
- 추가 Production 배포는 다른 pending migration이 있으면 또 `migrate deploy`를 돌립니다. **확인 전 불필요한 Production 배포 push에 주의.**
- **Vercel migration 정책을 별도로 결정하기 전에는 새로운 migration 파일을 main에 추가·push하지 않습니다.**
- 본 mutation guard는 **로컬 테스트 DB 보호용**입니다. Vercel Production의 `migrate deploy`를 **차단하지 않습니다.**

### 체크리스트 (유지)

- [x] Vercel Project의 실제 Build Command 확인
- [x] 최근 배포 로그에 `prisma migrate deploy` 실행 여부 확인
- [x] 운영 DB에 송장전송 migration이 이미 적용됐는지 확인 (`6616521` 로그)
- [ ] Vercel migration 정책 결정 전 **새 migration 파일 push 금지** (진행 중)
- [ ] 확인 전·후에도 추가 Production 배포를 유발하는 push 주의 (진행 중)

**이 문서에서 Vercel 설정은 변경하지 않습니다.**

---

## 3. 사전 조건

| # | 조건 |
|---|------|
| 1 | Vercel 자동 migration 여부 확인 (위 §2 — **완료**) |
| 2 | `.env.smoke.local`이 **테스트 DB 전용** (운영 `.env` / `.env.local` 아님) |
| 3 | 운영 project ref ≠ 테스트 project ref (스크립트 상수로 구분) |
| 4 | `EXCLOAD_ENV_PROFILE=smoke` |
| 5 | `TEST_DB_ENV_FILE=.env.smoke.local` |
| 6 | `ALLOW_TEST_DB_MUTATION=true` (확인 후에만; example 기본값은 `false`) |
| 7 | `DATABASE_URL` / `DIRECT_URL` SET + 동일 테스트 project |
| 8 | `git status` 확인 — 의도치 않은 변경·secret 없음 |
| 9 | migration 파일 존재 + 정적 검사 PASS |

`EXCLOAD_INTEGRATION_ENCRYPTION_KEY`는 **이번 Prisma mutation/migration 검증에 필수가 아님**  
(주문조회 실연동 검사 `check-order-sync-realtest-env.mjs`와 분리).

---

## 4. 실행 전 순서 (D-6g-c 직전)

1. `.env.smoke.local`에 profile / marker / `ALLOW_TEST_DB_MUTATION=true` 반영 (로컬만, git 금지)
2. **검사 전용** preflight 실행 (migrate·DB 접속 없음):
   ```bash
   npm run order-transmission:test-db:check
   ```
   - **검사 전용** — migration을 적용하지 않습니다. 이름만 보고 migrate까지 된다고 오해하지 마세요.
   - 스크립트는 **디스크의 `.env.smoke.local`만** 읽습니다.
   - 현재 shell의 `DATABASE_URL` / `.env` / `.env.local`로 **대체하지 않습니다**.
3. 출력에 `TEST DB MUTATION PREFLIGHT: PASS` 확인
4. migration 대상 파일 정적 검사 PASS 확인 (같은 명령에 포함)
5. **그 다음에만** D-6g-c에서 `prisma migrate deploy` 실행

### D-6g-c에서 실행할 예정 명령 (이번 단계에서는 실행 금지)

형태만 기록합니다. **guard PASS 후에만**.

```bash
# 예시 — D-6g-c에서 승인 후 실행
# 1) preflight 재확인
npm run order-transmission:test-db:check

# 2) smoke env만 사용해 migrate deploy (팀 표준 로더로 DATABASE_URL이 smoke인지 재확인)
#    Windows PowerShell 예: 별도 세션에서 .env.smoke.local 값을 프로세스 env로만 주입 후
#    npx prisma migrate deploy
#
# 금지: prisma migrate dev / db push / migrate reset
# 출력: 적용된 migration **이름만** 확인. connection string 출력 금지.
```

적용 전후 확인은 migration **이름**만 (예: `20260710230000_add_shipment_transmission_attempts`).

---

## 5. 절대 금지

- `.env` / `.env.local`로 migration
- 운영 `DATABASE_URL` 사용
- `prisma migrate dev`
- `prisma db push`
- `prisma migrate reset`
- guard FAIL 상태에서 강행
- URL·password·project ref를 채팅·보고서·커밋에 붙이기
- Production Vercel env에 `ALLOW_TEST_DB_MUTATION=true` 설정

---

## 6. migration 정적 검사 한계

`check-shipment-transmission-test-db-env.mjs`의 SQL 검사는 **완전 증명이 아닙니다.**  
잘못된 대상 파일·명백한 파괴적 SQL·connection string/ref 유출 형태를 막는 **1차 방어**입니다.

차단 목적:

- 파일 누락 / 빈 파일
- Attempt 테이블·PROCESSING/UNKNOWN enum 구문 부재
- `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` 형태
- SQL 안 connection string·password·Authorization·secret·project ref 유출 형태

통과해도 DB 권한·락·enum 호환 문제는 남을 수 있습니다.

---

## 7. rollback 한계

- PostgreSQL enum 값 추가는 **단순 down migration이 어렵습니다**
- Attempt 테이블 검증은 **테스트 DB**에서 수행
- 실패 시 운영에 영향 주지 않도록 **별도 smoke DB**를 유지; 필요 시 테스트 DB 재생성 또는 후속 migration
- 자동 down migration을 만들지 않음

운영 DB는 이미 §2대로 migration이 적용된 상태이므로, 테스트 실패를 이유로 운영을 “되돌리려” 하지 마세요.

---

## 8. 향후 cleanup 안전 원칙 (코드 미구현)

아직 fixture/cleanup 스크립트는 만들지 않습니다. 이후 구현 시:

| 원칙 | 내용 |
|------|------|
| 범위 | 이번 테스트가 생성한 `userId` 또는 고정 test prefix만 |
| 금지 | 전체 `ShipmentMatch` / `OrderSyncOrder` 삭제, 테이블 `TRUNCATE` |
| ID 목록 | 테스트 시작 시 생성 ID를 보관 후 그 목록만 삭제 |
| 순서 | FK 관계 준수 (Attempt → Match → …) |
| guard | cleanup 전 **동일 mutation preflight 재통과** |
| 출력 | 삭제 **건수만**, 데이터 원문 금지 |

---

## 9. 관련 명령

| 명령 | 역할 |
|------|------|
| `npm run order-transmission:test-db:check` | **검사 전용** preflight + migration.sql 정적 검사 (DB 접속·migrate **없음**) |
| `node scripts/check-order-sync-realtest-env.mjs` | 주문조회 실연동 env (암호화 키 등) — **별도** |

`order-transmission:test-db:check`는 이름에 `check`만 있습니다. **migrate/deploy/cleanup/fixture를 실행하지 않습니다.**

migrate/fixture/cleanup 원클릭 script는 **의도적으로 추가하지 않음** (혼동·오적용 방지).

---

## 10. 다음 단계

| 단계 | 내용 |
|------|------|
| D-6g-b | 본 guard·runbook ← 현재 |
| D-6g-c | 테스트 DB에만 `migrate deploy` (승인 후) |
| D-6g-d | 실제 Prisma persist adapter |
| D-6g-e | integration test + cleanup |
| D-6g-f | dry-run API |
