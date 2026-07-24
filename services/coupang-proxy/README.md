# Order Integration Fixed-IP Proxy (Reference)

엑클로드 Vercel → **`https://coupang-proxy.excload.com`** → Lightsail Static IP → **upstream API host**

쿠팡 전용으로 시작했으나, 현재 레포는 **범용 주문연동 프록시**도 포함합니다.

## 엔드포인트

| 경로 | 용도 |
|------|------|
| `GET /healthz` | 헬스체크 — allowed upstream host·suffix rule (secret 미노출) |
| `POST /internal/coupang/invoke` | **쿠팡 전용** — HMAC 서명·`api-gateway.coupang.com` (하위 호환) |
| `POST /internal/integration/invoke` | **범용** — 스마트스토어·11번가·카페24 등 direct 몰 + 사방넷 hub upstream |

Vercel env: `INTEGRATION_PROXY_BASE_URL` + `INTEGRATION_PROXY_SHARED_SECRET`  
(하위 호환: `COUPANG_PROXY_*`)

## integrationType 과 upstream host (SSOT)

| integrationType | 프록시 upstream | allowed-hosts |
|-----------------|-----------------|---------------|
| **direct_api** | 각 쇼핑몰 Open API host (`api.11st.co.kr` 등) | ✅ exact / suffix |
| **hub_api** | 허브 API host (`sbadmin.sabangnet.co.kr` 등) | ✅ 허브 host만 (`priority_hub` 3곳 검토) |
| **excel_upload** | 없음 (엑셀 업로드) | ❌ 등록 안 함 |

**allowed-hosts.mjs는 “연동 가능한 전체 채널 목록”이 아닙니다.**  
프록시가 실제로 나가는 **upstream hostname** 목록입니다.

- `api.11st.co.kr` → 11번가 **direct** 연동용 (사방넷 hub 경유 host 아님)
- `sbadmin.sabangnet.co.kr` → **사방넷 hub** upstream (hub 전체 구현 완료 의미 아님)
- 플레이오토·샵링커 등 다른 hub는 API host 확정·구현 후 별도 추가
- **hub 우선 검토 3곳**: playauto · sabangnet · easyadmin (`priority_hub`) — 보조 연동, direct가 메인

`9cadf36` host sync 패치 = **direct 10채널 upstream + 카페24 suffix + 사방넷 hub host**  
→ hub 전체(플레이오토 등) 구현 완료가 **아님**.

## 배포 가이드 (필독)

**서울 Lightsail $5 · DNS · Caddy HTTPS · `/healthz` 확인:**

→ **[`docs/coupang-proxy-lightsail-ec2-deploy.md`](../docs/coupang-proxy-lightsail-ec2-deploy.md)**

API 계약:

→ [`docs/coupang-proxy-transport.md`](../docs/coupang-proxy-transport.md)

## Quick start (VM 내부 테스트)

```bash
INTEGRATION_PROXY_SHARED_SECRET=your-shared-secret node server.mjs
curl -s http://127.0.0.1:8787/healthz
```

## Production (요약)

| 항목 | 값 |
|------|------|
| 도메인 | `coupang-proxy.excload.com` |
| DNS | A → Lightsail Static IP |
| TLS | Caddy `reverse_proxy localhost:8787` |
| Vercel `INTEGRATION_PROXY_BASE_URL` | `https://coupang-proxy.excload.com` |
| 몰 WING / 판매자센터 IP | Lightsail Static IP (Vercel IP ❌) |

## Production checklist

- [ ] TLS(HTTPS) — Caddy
- [ ] Static IP → 각 몰·허브 IP 등록 + `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP`
- [ ] `INTEGRATION_PROXY_SHARED_SECRET` Vercel과 동일
- [ ] credential·주문본문 로그 미노출
- [ ] `excload-proxy-watchdog.timer` 활성 (아래)

## 자동 복구 (워치독)

| 층 | 역할 |
|----|------|
| systemd `Restart=always` | Node 프로세스 크래시 시 재시작 |
| `watchdog.sh` + timer | `/healthz` 실패 → 서비스 재시작 → 연속 실패 시 **머신 리부트** |

머신 전체가 굳으면 프로세스 재시작만으로는 안 되므로, 워치독이 로컬 health를 보고 필요 시 리부트합니다.  
설치·검증: [`docs/coupang-proxy-lightsail-ec2-deploy.md`](../docs/coupang-proxy-lightsail-ec2-deploy.md) **Step 13**.

파일:

- `watchdog.sh`
- `excload-proxy-watchdog.service.example`
- `excload-proxy-watchdog.timer.example`
