# 송장전송 — 테스트 DB migration / Prisma 검증 Runbook (D-6g)

> **상태**: D-6g-e1 코드 준비 완료 (2026-07-11) — **e1에서 DB 접속·integration 실행 안 함**  
> **단계**: D-6g-b → c → d → **e1** (다음 e2 실실행)  
> **목적**: 운영 DB 오접속을 차단한 뒤, **기존 smoke 테스트 DB**에만 송장전송 migration·Prisma persist를 검증하기 위한 preflight·절차·integration wrapper  
> **관련**  
> - `scripts/check-shipment-transmission-test-db-env.mjs`  
> - `scripts/run-shipment-transmission-db-integration.mjs`  
> - `scripts/lib/shipment-transmission-test-db-guard.mjs`  
> - `.env.smoke.local.example`  
> - `prisma/migrations/20260710230000_add_shipment_transmission_attempts/`  
> - [shipment-api-transmission-design.md](./shipment-api-transmission-design.md)

**이 문서는 절차·경고를 다룹니다.**  
D-6g-e1에서 하지 않는 것: 실 DB 접속, integration script 실행, `.env.smoke.local` 수정, 새 migration, 커밋·push.

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

## 8. cleanup 안전 원칙 (D-6g-e1 구현)

| 원칙 | 내용 |
|------|------|
| 범위 | 이번 run이 생성·추적한 ID만 (`ShipmentTransmissionItIds`) |
| 금지 | prefix만으로 광범위 삭제, `deleteMany({})`, 테이블 `TRUNCATE` |
| 순서 | Attempt → Match → UploadRow → UploadBatch → Order → OrderBatch → Account → User |
| User | 삭제 전 `shipment-transmission-it-*@example.test` email prefix 확인 |
| gate | `SHIPMENT_TRANSMISSION_IT_RUN=true` + `ALLOW_TEST_DB_MUTATION=true` + smoke markers |
| 출력 | 삭제 **건수만**, 행 내용·URL·ref 금지 |

---

## 9. 관련 명령

| 명령 | 역할 |
|------|------|
| `npm run order-transmission:test-db:check` | **검사 전용** preflight + migration.sql 정적 검사 (DB 접속·migrate **없음**) |
| `npm run order-transmission:test-db:integration` | smoke env 강제 주입 + integration vitest만 (migrate **없음**) |
| `node scripts/check-order-sync-realtest-env.mjs` | 주문조회 실연동 env (암호화 키 등) — **별도** |

`order-transmission:test-db:check`는 migrate/fixture를 실행하지 않습니다.  
`order-transmission:test-db:integration`은 **전용 wrapper**로만 실행합니다. 일반 `npm test` / `vitest`에는 `*.integration.test.ts`가 **제외**됩니다.

---

## 10. D-6g-e1 / D-6g-e2 — Prisma persist integration

### D-6g-e1 (코드 준비만 — DB 미접속)

- wrapper: `scripts/run-shipment-transmission-db-integration.mjs`
- core: `scripts/lib/run-shipment-transmission-db-integration-core.mjs`
- fixture/cleanup: `transmission/__tests__/integration/support/`
- 시나리오 파일: `*.persist.integration.test.ts` (작성만, **실행 안 함**)
- 일반 unit test에서 integration 제외 (`vitest.config.ts`)
- 병렬 금지: `vitest.integration.config.ts` maxWorkers=1 + file lock
- **이중 gate**: wrapper preflight + test 파일 `evaluateIntegrationMutationGate` (IT_RUN / mutation / smoke markers). config 직접 실행해도 gate 없으면 Prisma/fixture/cleanup 차단
- **전용 wrapper 외 직접 실행 금지** (일반 `vitest` / `.env` fallback 경로 사용 금지)
- fixture는 생성 직후 ID 추적 → 부분 실패 시에도 `finally` cleanup + `$disconnect`
- stale lock은 자동 삭제하지 않음 (PID 생존 확인 후 수동 삭제 안내)

### Prisma / runner `.env` fallback 위험

Prisma CLI·일부 도구는 cwd의 `.env`를 읽을 수 있습니다.  
integration wrapper는:

1. 디스크의 `.env.smoke.local`만 파싱
2. shell `DATABASE_URL` / `DIRECT_URL` 무시
3. child에 smoke URL을 **강제 주입**
4. `PrismaClient({ datasources: { db: { url } } })`로 명시 연결

운영 `.env` fallback으로 integration을 돌리지 마세요.

### D-6g-e2 시작 직전 (사용자)

1. `.env.smoke.local`의 `EXCLOAD_ENV_PROFILE` / `TEST_DB_ENV_FILE` / DB URL 확인
2. `ALLOW_TEST_DB_MUTATION=true` (로컬만)
3. `npm run order-transmission:test-db:check` → PASS
4. `npm run order-transmission:test-db:integration` 실행

### D-6g-e2 종료 후 (사용자)

1. cleanup 성공(건수) 확인
2. `ALLOW_TEST_DB_MUTATION=false` 복구
3. `git status` — secret·의도치 않은 변경 없음

### 시나리오 K (TX rollback)

실 DB에서 unique 충돌·존재하지 않는 Order update를 고의 유도하면 fixture가 불안정해질 수 있어 **integration에 억지 구현하지 않음**.  
repository / prisma-persist **단위 테스트**로 충분하다고 본다.

---

## 11. 다음 단계

| 단계 | 내용 |
|------|------|
| D-6g-b | guard·runbook |
| D-6g-c | 테스트 DB `migrate deploy` (완료) |
| D-6g-d | Prisma persist client (완료) |
| D-6g-e1 | integration 코드 준비 (DB 미실행) ← 현재 |
| D-6g-e2 | smoke DB에서 integration 실실행 |
| D-6g-f | dry-run API |
