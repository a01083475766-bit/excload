# 송장 업로드·export smoke test — Test DB Setup Runbook

> **상태**: setup runbook (2026-07-10) — **실행 전 승인 필요**  
> **단계**: D-4h-2  
> **목적**: 운영 DB와 **분리된 테스트 DB**에서 D-4 smoke test를 안전하게 준비하기 위한 **세부 절차**  
> **선행 문서**  
> - [shipment-upload-export-test-db-plan.md](./shipment-upload-export-test-db-plan.md) — D-4h-1 (C안 계획)  
> - [shipment-upload-export-smoke-data-preparation-plan.md](./shipment-upload-export-smoke-data-preparation-plan.md) — D-4h-준비  
> - [shipment-upload-export-smoke-readiness-report.md](./shipment-upload-export-smoke-readiness-report.md) — D-4g (**보류**)  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) — D-4d (smoke 실행)  
> - [smoke-samples/README.md](./smoke-samples/README.md) — D-4e

**본 문서는 runbook(절차)만 다룹니다.**  
**D-4h-2 문서 작성 단계에서 수행하지 않는 것**: Supabase 프로젝트 생성, DB 생성·변경, env 파일 생성·수정, migration 실행, seed 작성, smoke test 실행, DB insert/update/delete, 쇼핑몰 API 호출, 송장전송.

**검증 범위 (최종 목표)**  
- 송장파일 업로드 → 매칭 → 확정/제외/연결 → READY → **쇼핑몰 업로드용 xlsx 다운로드** (파일 다운로드까지만)

**검증 범위 아님**  
- 쇼핑몰 API **송장전송**

> ⚠️ 아래 명령어·콘솔 작업은 **예시**입니다. **실행 전 사용자 승인**이 필요하며, 본 D-4h-2 단계에서는 **실행하지 않습니다**.

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | 별도 **테스트 DB** 프로비저닝·migration·env 분리 **절차** 문서화 |
| 왜 | D-4g **보류** — 운영/기존 DB에 smoke snapshot 없음, Production DB 공유 위험 |
| 무엇이 아님 | smoke 실행, 데이터 insert (→ D-4h-3), 실제 API 송장전송 |

---

## 2. 현재 상태

| 항목 | 상태 |
|------|------|
| D-4g readiness | **보류** |
| D-4h-1 test DB plan | ✅ 완료 |
| D-4h-2 setup runbook | ✅ 본 문서 (실행은 미수행) |
| 기존/운영 연결 DB | `OrderSyncOrder` **0건**, `COUPANG` 계정 **0건** |
| smoke 전용 `userId` | **미확정** |
| 샘플 문서·CSV | ✅ 준비됨 |
| **결론** | **별도 테스트 DB setup 필요** (C안) |

---

## 3. setup 원칙

| 원칙 | 설명 |
|------|------|
| Production DB **완전 분리** | smoke row가 운영 Supabase에 생성되면 안 됨 |
| **운영 `.env` 수정 금지** | 실수 방지 — 별도 env 파일만 사용 |
| **Vercel Production env 변경 금지** | 로컬 smoke 전용 |
| **테스트 전용 env 파일** | 예: `.env.smoke.local` |
| **env 파일 git 커밋 금지** | URL·secret 레포 유입 방지 |
| **실행 전 사용자 승인** | setup·migrate·dev 기동 각각 확인 |
| **송장전송·쇼핑몰 API 호출 금지** | setup 단계에서도 해당 없음 |

---

## 4. 테스트 DB 준비 방식

### 4.1 권장

| 항목 | 권장 값 (예시만) |
|------|------------------|
| 플랫폼 | **Supabase 별도 프로젝트** 또는 전용 Postgres |
| 프로젝트/DB 이름 (예시) | `excload-smoke-test` |
| Region | 운영과 동일 region 가능 (프로젝트는 **별도**) |
| 용도 라벨 | `smoke-test-only` — 팀 내 식별 |

### 4.2 문서에 적지 않는 것

- 실제 `DATABASE_URL` / `DIRECT_URL` 값  
- Supabase API key / service role secret  
- DB 비밀번호  

### 4.3 D-4h-2에서 하지 않는 것

- Supabase 대시보드에서 프로젝트 **실제 생성**  
- Connection string **복사·저장** (승인 후 담당자가 수행)

### 4.4 setup 절차 개요 (승인 후 실행 예시)

1. Supabase에서 **새 프로젝트** 생성 (이름 예: `excload-smoke-test`) — **실행 전 승인 필요**  
2. Project Settings → Database에서 **Connection string** 확보 (담당자 로컬만 보관)  
3. 운영 프로젝트 URL·호스트와 **다른지** 눈으로 확인  
4. §5 env 파일에 **테스트 URL만** 기록  
5. §6 migration 적용  
6. §7 userId 확정  
7. D-4h-3에서 account·order insert  

---

## 5. env 파일 계획

### 5.1 권장 파일명

```text
.env.smoke.local
```

- 레포 루트에 두되 **git에 커밋하지 않음**
- 운영 `.env` / `.env.local` **덮어쓰기 금지**

### 5.2 포함 항목 예시 (placeholder만)

```text
# .env.smoke.local — smoke test 전용 (git 커밋 금지)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/postgres?pgbouncer=true
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/postgres

# NextAuth — smoke 로컬 세션용 (운영 secret 재사용 지양)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<smoke-test-only-secret>

# ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED — 임의 변경 금지 (기본 정책 유지)
```

`SHADOW_DATABASE_URL`은 migration shadow가 필요할 때만 — Prisma 문서·팀 정책에 따름.

### 5.3 `.gitignore` 확인

현재 레포 `.gitignore`:

```text
.env
```

| 파일 | gitignore |
|------|-----------|
| `.env` | ✅ 제외됨 |
| `.env.smoke.local` | ⚠️ **명시 없음** — setup **실행 전** `.env.smoke.local` 또는 `.env*.local` 추가 권장 (**별도 승인·커밋**) |

**D-4h-2**: `.gitignore` **변경하지 않음** — 실행 단계 체크리스트에만 기록.

### 5.4 dev 서버 로드 (예시 — 실행 전 승인 필요)

```bash
# 예시 1: dotenv-cli 사용 시 (패키지 유무는 실행 전 확인)
npx dotenv -e .env.smoke.local -- npm run dev

# 예시 2: PowerShell에서 일시 로드 (운영 .env 백업 후)
# Get-Content .env.smoke.local | ForEach-Object { ... }  ← 팀 표준 방식으로 확정
```

smoke 세션 종료 후 **운영 env만** 사용하는지 재확인.

---

## 6. schema / migration 적용 계획

| 규칙 | 설명 |
|------|------|
| Prisma **schema 변경** | ❌ 금지 |
| 적용 대상 | **테스트 DB만** |
| 운영 DB `migrate deploy` | ❌ 금지 |
| drift / pending | **즉시 중단**, 원인 조사 |

### 6.1 실행 전 확인 (예시 — 승인 필요)

```bash
# 1) 연결 대상이 테스트 DB인지 환경 변수 확인 (호스트·프로젝트 ref)
# 2) schema 유효성
npx prisma validate

# 3) migration 상태 (DATABASE_URL = 테스트 DB일 때만)
npx prisma migrate status
```

**기대**: `Database schema is up to date!` 또는 pending이 있으면 **테스트 DB에만** deploy.

### 6.2 migration 적용 (예시 — 실행 전 승인 필요)

```bash
# ⚠️ DATABASE_URL이 테스트 DB인지 반드시 확인 후
npx prisma migrate deploy
```

**D-4h-2**: 위 명령 **실행하지 않음**.

### 6.3 실패 시

- 운영 URL에 연결된 것으로 의심되면 **즉시 중단**  
- `migrate status`에서 unexpected drift → schema 수정 없이 팀 공유  

---

## 7. smoke 전용 사용자 준비 계획

| 항목 | 설명 |
|------|------|
| 필요 | smoke test **전용** NextAuth 로그인 사용자 1명 |
| `userId` | DB `User` 테이블 id — **read-only로 확인** 후 문서(로컬 메모)에 기록 |
| 금지 | **운영 사용자** `userId`로 smoke 데이터 생성 |
| 선행 | userId **확정 전** D-4h-3 insert runbook **진행 불가** |

### 확정 절차 (승인 후)

1. 테스트용 이메일 계정 생성 또는 기존 **전용** 계정 지정 (사용자 승인)  
2. 테스트 DB에 연결된 상태에서 로그인 1회 또는 `User` row 확인  
3. `userId` 기록 — **레포 문서에 실제 id 커밋 지양** (로컬 runbook 메모·비공개)  
4. 이후 account·order는 **동일 userId**만 사용  

---

## 8. smoke 전용 계정 / snapshot 준비 계획

**실제 insert는 D-4h-3** — 본 절은 **필요 데이터 목록**만 정리.

| 대상 | 수량 | 기준 |
|------|------|------|
| `OrderIntegrationAccount` | 1 | `provider`: `COUPANG`, scope/id: `acc-smoke-test-001` |
| `OrderSyncBatch` | 1+ | snapshot 5건 묶음 |
| `OrderSyncOrder` | **5건** | [shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) |
| 송장 CSV | 1 | [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) |

### 5건 시나리오 요약

| # | 처리 | export |
|---|------|--------|
| 1 | confirm (자동 매칭) | ✅ |
| 2 | confirm (warning) | ✅ |
| 3 | link | ✅ |
| 4 | exclude | ❌ |
| 5 | confirm (`000123456789`) | ✅ |

**D-4h-3**에서 insert SQL/Prisma 절차 runbook 작성 → **사용자 승인 후** write.

---

## 9. 실행 전 체크리스트

setup **실행 직전** (승인 후):

### 9.1 Git / 레포

- [ ] `git status` — `app/` 의도치 않은 변경 없음  
- [ ] `main` = `origin/main` 최신  
- [ ] `next-env.d.ts` — 커밋 제외 유지  
- [ ] `scripts/capture-hero-gif.mjs` — untracked·커밋 제외  

### 9.2 env / DB

- [ ] `.env.smoke.local` 작성됨 — **git에 add 되지 않음**  
- [ ] 운영 `.env` **미변경**  
- [ ] 테스트 `DATABASE_URL` 호스트 ≠ 운영 호스트 (눈·문자열 비교)  
- [ ] Vercel Production env **미변경**  

### 9.3 migration / 사용자

- [ ] `npx prisma migrate deploy` 대상 = **테스트 DB만**  
- [ ] `migrate status` — drift 없음 또는 해결됨  
- [ ] smoke 전용 **userId** 확정 (운영 user 아님)  

### 9.4 범위

- [ ] 송장전송 API/버튼 **호출·구현 없음**  
- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` **임의 변경 없음**  

---

## 10. 중단 조건

다음 중 하나면 setup **중단**:

| 조건 | 조치 |
|------|------|
| 운영 `DATABASE_URL`과 테스트 URL **구분 불가** | env 재작성, 호스트 확인 |
| smoke `userId` **불명확** | 사용자 계정 확정 후 재시도 |
| 연결 DB가 테스트인지 **확신 불가** | migrate/deploy 중단 |
| migration **drift** / unexpected pending | schema 수정 없이 조사 |
| env 변경이 **운영 `.env` 수정**을 요구 | C안 재검토, 별도 DB 재확인 |
| 외부 쇼핑몰 API 호출 필요 | **중단** — D-4 범위 밖 |
| 송장전송 필요 | **중단** — D-4 범위 밖 |

---

## 11. 다음 단계

```
D-4h-2 (본 runbook)  →  [승인] setup 실행  →  D-4h-3 insert  →  D-4h-4 smoke
```

| 단계 | 내용 | DB write |
|------|------|----------|
| **D-4h-2 문서** | 본 runbook | ❌ 없음 |
| **D-4h-2 실행** | Supabase 프로젝트·migrate·env (승인 후) | schema만 (migrate) |
| **D-4h-3** | smoke 데이터 insert runbook | ✅ [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) — **승인 후 실행** |
| **D-4h-4** | [smoke runbook](./shipment-upload-export-smoke-test-runbook.md) 실행 | upload batch 등 |

**지금 할 일 (사용자)**  
1. **C안** 및 본 runbook **실행 승인**  
2. Supabase `excload-smoke-test`(예) 프로젝트 생성 담당 지정  
3. smoke **전용 로그인 계정** 지정  

**지금 하지 않을 일 (D-4h-2 문서 단계)**  
- 프로젝트 생성, env 생성, migration, insert, smoke  

---

## 부록 — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4h-1 | [test-db-plan](./shipment-upload-export-test-db-plan.md) |
| D-4h-2 | **본 runbook** |
| D-4h-3 | [insert-runbook](./shipment-upload-export-smoke-data-insert-runbook.md) |
| D-4h-4 | [smoke-test-runbook](./shipment-upload-export-smoke-test-runbook.md) |
| D-4h-5 | (예정) cleanup runbook |
