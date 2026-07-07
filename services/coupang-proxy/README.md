# Coupang API Fixed-IP Proxy (Reference)

엑클로드 Vercel → **`https://coupang-proxy.excload.com`** → Lightsail Static IP → 쿠팡 API

## 배포 가이드 (필독)

**서울 Lightsail $5 · DNS · Caddy HTTPS · `/healthz` 확인:**

→ **[`docs/coupang-proxy-lightsail-ec2-deploy.md`](../docs/coupang-proxy-lightsail-ec2-deploy.md)**

API 계약:

→ [`docs/coupang-proxy-transport.md`](../docs/coupang-proxy-transport.md)

## Quick start (VM 내부 테스트)

```bash
COUPANG_PROXY_SHARED_SECRET=your-shared-secret node server.mjs
curl -s http://127.0.0.1:8787/healthz
```

## Production (요약)

| 항목 | 값 |
|------|-----|
| 도메인 | `coupang-proxy.excload.com` |
| DNS | A → Lightsail Static IP |
| TLS | Caddy `reverse_proxy localhost:8787` |
| Vercel `COUPANG_PROXY_BASE_URL` | `https://coupang-proxy.excload.com` |
| 쿠팡 WING IP | Lightsail Static IP (Vercel IP ❌) |

## Production checklist

- [ ] TLS(HTTPS) — Caddy
- [ ] Static IP → WING + `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP`
- [ ] `COUPANG_PROXY_SHARED_SECRET` Vercel과 동일
- [ ] Secret Key 로그 마스킹
