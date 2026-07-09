# 송장 업로드·export smoke test — 별도 테스트 DB 준비 계획

> **상태**: 준비 계획 문서 (2026-07-10) — **실행·DB/env 변경 없음**  
> **단계**: D-4h-1  
> **목적**: D-4 smoke test를 **운영 DB와 분리된 테스트 DB**에서 안전하게 실행하기 위한 절차·규칙 정리  
> **관련 문서**  
> - [shipment-upload-export-smoke-data-preparation-plan.md](./shipment-upload-export-smoke-data-preparation-plan.md) — D-4h-준비 (C안 1순위)  
> - [shipment-upload-export-smoke-readiness-report.md](./shipment-upload-export-smoke-readiness-report.md) — D-4g (판정: **보류**)  
> - [shipment-upload-export-preflight-checklist.md](./shipment-upload-export-preflight-checklist.md) — D-4f  
> - [shipment-upload-export-smoke-test-runbook.md](./shipment-upload-export-smoke-test-runbook.md) — D-4d  
> - [smoke-samples/](./smoke-samples/) — D-4e  
> - [snapshot-persist-smoke-test.md](./snapshot-persist-smoke-test.md) — DB·env 주의 참고

**이 문서는 계획·절차만 다룹니다.**  
수행하지 않는 것: 테스트 DB **실제 생성**, env **실제 변경**, migration **실행**, seed 작성, smoke test 실행, 쇼핑몰 API 호출, 송장전송.

**검증 범위**  
- 업로드 → 매칭 → 확정/제외/연결 → READY → **쇼핑몰 업로드용 xlsx 다운로드** (파일 다운로드까지만)

**검증 범위 아님**  
- 쇼핑몰 API **송장전송**  
- 운영 DB에 smoke row 생성

---

## 1. 목적

| 항목 | 설명 |
|------|------|
| 무엇을 | smoke test용 **별도 테스트 DB** 분리 방안·준비 순서·안전 규칙 문서화 |
| 왜 | D-4h-준비에서 **C안(별도 테스트 DB)** 이 1순위 — Production Supabase와 local `.env`가 **동일할 가능성** |
| 무엇이 아님 | DB 프로비저닝 실행, env 적용, smoke 실행 |

smoke test는 **송장전송 검증이 아닙니다**.  
매칭 처리 후 **엑셀 파일 다운로드** 흐름만 확인합니다.

---

## 2. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| D-4g readiness | **보류** — D-4h 즉시 실행 불가 |
| D-4h-준비 추천 | **C안** — 별도 테스트 DB (1순위) |
| `OrderSyncOrder` (현재 연결 DB) | **0건** (D-4g read-only) |
| `COUPANG` 연동 계정 | **0건** |
| `acc-smoke-test-001` | **없음** |
| smoke 전용 `userId` | **미확정** |
| 샘플 문서·CSV | ✅ 준비됨 |
| 운영 DB = local `.env` | ⚠️ **가능성 있음** (Supabase pooler endpoint 확인됨) |

**결론**: smoke를 **운영 DB에서 바로 실행하면 안 됨**. 테스트 DB 분리 후 데이터·smoke 진행.

---

## 3. 테스트 DB 방식

### 3.1 권장 구성

| 항목 | 권장 |
|------|------|
| DB | **Supabase 별도 프로젝트** 또는 전용 Postgres (운영과 **완전 분리**) |
| 연결 | smoke 전용 `DATABASE_URL` / `DIRECT_URL` |
| env | **별도 파일** (예: `.env.smoke.local` — **git 커밋 금지**) |
| 앱 실행 | smoke 세션에서만 해당 env 로드 — **운영 `.env` 덮어쓰기 금지** |
| Vercel Production | **변경 금지** |

### 3.2 분리 원칙

```
[운영]  Production Supabase  ←  Vercel Production DATABASE_URL
                                      ≠ (반드시 분리)
[smoke] 테스트 Supabase/Postgres  ←  .env.smoke.local (로컬만, 미커밋)
```

- smoke 중 생성되는 `ShipmentUploadBatch`, `OrderSyncOrder` 등은 **테스트 DB에만** 존재해야 함
- 운영 주문·실제 고객 PII와 **섞이지 않음**

### 3.3 대안 (비권장 — 문서화만)

| 방식 | 판단 |
|------|------|
| 동일 Supabase + smoke 전용 schema | 인프라·권한 복잡 — **별도 프로젝트 권장** |
| 동일 DB + B안 수동 insert | [data-preparation-plan](./shipment-upload-export-smoke-data-preparation-plan.md) 2순위 — **운영 DB 위험** |

**본 D-4h-1**: **별도 테스트 DB(C안)** 전제로 문서화. **실제 생성은 하지 않음**.

---

## 4. 필요한 데이터 (테스트 DB 내)

smoke 실행 전 테스트 DB에 있어야 할 것 ([smoke-samples](./smoke-samples/) 기준):

| # | 대상 | 수량 | 비고 |
|---|------|------|------|
| 1 | smoke 전용 `User` (NextAuth 로그인) | 1 | 운영 user **금지** |
| 2 | `OrderIntegrationAccount` | 1 | `COUPANG`, id/scope: `acc-smoke-test-001` |
| 3 | `OrderSyncBatch` | 1+ | snapshot 5건 묶음 |
| 4 | `OrderSyncOrder` | **5건** | [shipment-upload-smoke-orders.md](./smoke-samples/shipment-upload-smoke-orders.md) |
| 5 | 송장 CSV (파일) | 1 | [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) |

**식별자 규칙**  
- `TEST-MALL-ORDER-*`, `EX-SMOKE-*` 더미만 사용  
- 실제 운영 주문번호·PII **금지**

---

## 5. 준비 순서 (계획 — 실행 없음)

| 순서 | 작업 | 담당 | D-4h-1 |
|------|------|------|--------|
| 1 | **C안 승인** — 별도 테스트 DB 사용 합의 | 사용자/팀 | 문서화만 |
| 2 | 테스트 DB **생성 여부** 확인 (Supabase 새 프로젝트 등) | 사용자/인프라 | ❌ 실행 안 함 |
| 3 | **schema 적용 방법** 확인 — `npx prisma migrate deploy` 대상이 **테스트 DB만**인지 | 개발 | ❌ 실행 안 함 |
| 4 | 테스트용 env **파일명·위치** 결정 (예: `.env.smoke.local`) | 개발 | 문서화만 |
| 5 | smoke 전용 **userId** 확보 (테스트 계정 생성·지정) | 사용자 | ❌ insert 안 함 |
| 6 | account + snapshot 5건 **insert 방식** — D-4h-3 runbook에서 상세화 | 개발 | 다음 단계 |
| 7 | smoke 전 **git / env** 재확인 — [preflight](./shipment-upload-export-preflight-checklist.md) | 개발 | D-4h-4 전 |

---

## 6. env 안전 규칙

| 규칙 | 설명 |
|------|------|
| 운영 `.env` 직접 수정 **금지** | Production `DATABASE_URL` 유지 |
| Production `DATABASE_URL` **덮어쓰기 금지** | 실수로 `npm run dev`가 운영 DB를 가리키면 smoke row가 운영에 생성됨 |
| 테스트 env **별도 파일** | 예: `.env.smoke.local` — `.gitignore`에 포함 확인 |
| env 파일 **커밋 금지** | URL·비밀번호 레포 유입 방지 |
| 실제 env **적용 전 사용자 승인** | D-4h-2에서 runbook 작성 후 승인 |
| smoke 종료 후 | 테스트 env 사용 중단, 운영 `.env`만 사용하는지 확인 |

### 권장 env 파일 예시 (이름만 — 값은 문서·커밋에 넣지 않음)

```text
# .env.smoke.local (로컬만, gitignore)
DATABASE_URL=postgresql://...test-project...
DIRECT_URL=postgresql://...test-project...
# NEXTAUTH_URL, NEXTAUTH_SECRET 등 smoke 세션용 — 운영과 분리 검토
```

**로드 방법** (D-4h-2 runbook에서 확정 — 본 단계에서는 실행 안 함)  
- 예: `dotenv -e .env.smoke.local -- npm run dev`  
- 또는 셸에서 일시 export 후 dev 실행 — **운영 `.env` 백업·복구 절차** 포함

---

## 7. migration / schema 주의

| 항목 | 규칙 |
|------|------|
| Prisma **schema 변경** | ❌ 금지 (D-4h-1 포함 전 Phase) |
| migration **적용 대상** | **테스트 DB만** — `migrate deploy` 전 `DATABASE_URL`이 테스트인지 **반드시 확인** |
| **운영 DB** migration | ❌ smoke 준비 목적으로 실행 금지 |
| `npx prisma migrate status` | 테스트 DB 연결 후 pending·drift 확인 (D-4h-2) |
| drift / pending 발생 | **즉시 중단**, schema 수정 없이 원인 조사 |

**기대 상태** (테스트 DB 준비 후)  
- `Database schema is up to date!`  
- pending migration **0건**

---

## 8. D-4 smoke 실행 조건 (테스트 DB 전제)

[runbook](./shipment-upload-export-smoke-test-runbook.md) 시작 전:

- [ ] 연결 중인 DB가 **테스트 DB**임을 확인 (URL·프로젝트명)
- [ ] smoke 전용 **userId** 확정
- [ ] `COUPANG` / `acc-smoke-test-001` **account** 존재
- [ ] `OrderSyncOrder` **5건** 존재 (`TEST-MALL-ORDER-*`)
- [ ] [shipment-upload-smoke-file.csv](./smoke-samples/shipment-upload-smoke-file.csv) 준비
- [ ] **송장전송** API route·UI 버튼 **없음** (다운로드만)
- [ ] `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` **임의 변경 없음**
- [ ] [readiness report](./shipment-upload-export-smoke-readiness-report.md) **재점검** — 보류 해제

---

## 9. 금지 사항

| 금지 | D-4h-1 |
|------|--------|
| 실제 DB 생성·변경 | ✅ |
| env 실제 변경·운영 `.env` 수정 | ✅ |
| migration 실행 (운영·테스트 모두) | ✅ |
| seed / Prisma seed 작성 | ✅ |
| smoke test 실행 | ✅ |
| 송장전송 구현·API 호출 | ✅ |
| 쇼핑몰 API 호출 | ✅ |
| `app/` 코드 변경 | ✅ |
| Prisma schema / migration 파일 변경 | ✅ |
| `ORDER_SYNC_SNAPSHOT_PERSIST_ENABLED` 변경 | ✅ |
| `next-env.d.ts` 커밋 | ✅ |
| `scripts/capture-hero-gif.mjs` 커밋 | ✅ |
| env 파일 커밋 | ✅ |

---

## 10. 다음 단계

```
D-4h-1 (본 문서)  →  사용자 C안 승인  →  D-4h-2  →  D-4h-3  →  D-4h-4
```

| 단계 | 내용 | 실행 |
|------|------|------|
| **D-4h-1** | 별도 테스트 DB 준비 **계획** | ✅ 문서만 (본 문서) |
| **D-4h-2** | 테스트 DB **세부 준비 runbook** (생성·migrate·env 적용 절차) | 사용자 **C안 승인** 후 작성 — **실행은 승인 후** |
| **D-4h-3** | smoke용 **데이터 insert runbook** (user, account, order 5건) | 테스트 DB·env 준비 **후** |
| **D-4h-4** | **실제 smoke 실행** + 결과 기록 | preflight·readiness 재통과 후 |

**지금 필요한 사용자 결정**  
1. **C안(별도 테스트 DB)** 승인 여부  
2. Supabase **새 프로젝트** 생성 권한·담당  
3. smoke test **전용 로그인 계정** 지정  

**지금 하지 않을 것**  
- DB 생성, env 스위치, migration, insert, smoke 업로드/다운로드

---

## 부록 — 문서 흐름 (D-4h)

| 단계 | 문서 |
|------|------|
| D-4g | [readiness-report](./shipment-upload-export-smoke-readiness-report.md) — 보류 |
| D-4h-준비 | [data-preparation-plan](./shipment-upload-export-smoke-data-preparation-plan.md) — C안 1순위 |
| D-4h-1 | **본 문서** — test DB plan |
| D-4h-2 | (예정) test DB setup runbook |
| D-4h-3 | (예정) smoke data insert runbook |
| D-4h-4 | (예정) smoke 실행·결과 |
