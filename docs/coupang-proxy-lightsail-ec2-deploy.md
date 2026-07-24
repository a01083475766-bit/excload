# 쿠팡 API 프록시 — Lightsail 배포 가이드 (서울 · excload.com)

> **대상:** 엑클로드 관리자 · AWS/Lightsail 초보자  
> **목표:** 관리자 계정에서 **쿠팡 연결 테스트 성공**  
> **본 가이드 고정값:** 리전 **서울(ap-northeast-2)** · Lightsail **$5/월** · 도메인 **`coupang-proxy.excload.com`** · HTTPS **Caddy 자동 인증서**

---

## 최종 구조

```text
Vercel 엑클로드 (www.excload.com)
    │
    │  COUPANG_PROXY_BASE_URL=https://coupang-proxy.excload.com
    ▼
https://coupang-proxy.excload.com  (Caddy TLS)
    │
    ▼
Lightsail Ubuntu · Node 프록시 (localhost:8787)
    │
    │  outbound = Lightsail Static IP  ← 쿠팡 WING에 등록하는 IP
    ▼
https://api-gateway.coupang.com  (쿠팡 Open API)
```

| 무엇 | 어디에 등록/설정 |
|------|------------------|
| 쿠팡 WING **IP** | **Lightsail Static IP** (Vercel IP ❌) |
| DNS **A 레코드** | `coupang-proxy.excload.com` → Static IP |
| Vercel `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP` | **동일한 Static IP** |
| Vercel `COUPANG_PROXY_BASE_URL` | `https://coupang-proxy.excload.com` |

> EC2·Vercel Static IP($100/월)는 **이번 단계에서 사용하지 않습니다.**

---

## 사전 준비

- [ ] AWS 계정
- [ ] `excload.com` DNS 관리 권한 (Route 53, Cloudflare, 가비아 등)
- [ ] 엑클로드 레포의 `services/coupang-proxy/server.mjs`
- [ ] (나중에) Vercel 환경변수 수정 권한

**공유 시크릿 미리 생성** (로컬 PC):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

→ 출력값을 안전한 곳에 저장. 나중에 **프록시 서버**와 **Vercel** `COUPANG_PROXY_SHARED_SECRET`에 **같은 값**으로 넣습니다.

---

## Step 1. Lightsail 인스턴스 생성 (서울 · $5)

1. [AWS Lightsail](https://lightsail.aws.amazon.com/) 접속
2. 우측 상단 리전이 **서울(ap-northeast-2)** 인지 확인
3. **인스턴스 생성(Create instance)**
4. 아래처럼 선택:

| 항목 | 선택값 |
|------|--------|
| 리전 | **서울 · ap-northeast-2** |
| 플랫폼 | Linux/Unix |
| 블루프린트 | **OS Only → Ubuntu 22.04 LTS** |
| 플랜 | **$5 USD/월** (512 MB RAM, 1 vCPU, 20 GB SSD) |
| 이름 | `excload-coupang-proxy` |

5. **생성** → 상태가 **Running** 될 때까지 1~2분 대기

---

## Step 2. Static IP 생성 및 연결

1. Lightsail 왼쪽 **네트워킹(Networking) → 고정 IP(Static IPs)**
2. **고정 IP 생성(Create static IP)**
3. **Attach** 대상: `excload-coupang-proxy`
4. 생성된 **Public IP**를 메모합니다.

```text
예: 3.34.xx.xx
```

이 IP가 아래 **세 곳**에 모두 들어갑니다.

- DNS A 레코드 (`coupang-proxy.excload.com`)
- 쿠팡 WING IP 등록
- Vercel `NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP`

> Static IP를 인스턴스에 **연결하지 않으면** 재시작 시 IP가 바뀝니다. 반드시 Attach 하세요.

---

## Step 3. 방화벽 포트 열기

인스턴스 `excload-coupang-proxy` → **Networking** 탭 → **IPv4 Firewall**

**규칙 추가(Add rule):**

| Application | Port | 용도 |
|-------------|------|------|
| SSH | 22 | 관리용 (Lightsail 기본) |
| HTTP | **80** | Caddy · Let's Encrypt 인증서 발급 |
| HTTPS | **443** | Vercel → 프록시 HTTPS |

- **8787은 외부에 열지 않습니다.** Node는 localhost만 listen하고, Caddy가 443에서 받습니다.

---

## Step 4. DNS A 레코드 설정

`excload.com` DNS 관리 화면에서 **새 레코드** 추가:

| 타입 | 이름(Name/Host) | 값(Value) | TTL |
|------|-----------------|-----------|-----|
| **A** | `coupang-proxy` | **Step 2 Static IP** | 300~600 |

결과: `coupang-proxy.excload.com` → Lightsail Static IP

**확인** (로컬 PC, 전파까지 수 분~최대 1시간):

```bash
nslookup coupang-proxy.excload.com
```

또는

```bash
dig +short coupang-proxy.excload.com
```

→ Step 2에서 메모한 IP와 **같아야** Caddy HTTPS가 성공합니다.

---

## Step 5. SSH 접속

Lightsail 인스턴스 페이지 → **SSH 사용(Connect using SSH)** (브라우저 터미널)

또는 로컬에서 (키 다운로드 후):

```bash
ssh -i LightsailDefaultKey-ap-northeast-2.pem ubuntu@<STATIC_IP>
```

이후 명령은 **모두 이 Ubuntu 서버 안**에서 실행합니다.

---

## Step 6. Node.js 설치

```bash
sudo apt update
sudo apt install -y curl

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node -v    # v20.x
```

---

## Step 7. 프록시 프로그램 배치

```bash
sudo mkdir -p /opt/excload-coupang-proxy
sudo chown ubuntu:ubuntu /opt/excload-coupang-proxy
cd /opt/excload-coupang-proxy
```

**파일 업로드 (로컬 PC에서, 레포 루트 기준):**

```bash
scp -i LightsailDefaultKey-ap-northeast-2.pem services/coupang-proxy/server.mjs ubuntu@<STATIC_IP>:/opt/excload-coupang-proxy/
```

또는 Git clone 후 복사:

```bash
git clone <엑클로드-레포-URL> repo
cp repo/services/coupang-proxy/server.mjs /opt/excload-coupang-proxy/
```

---

## Step 8. 프록시 환경변수

```bash
sudo nano /etc/excload-coupang-proxy.env
```

```env
COUPANG_PROXY_SHARED_SECRET=여기에_사전_준비한_공유_시크릿
PORT=8787
```

```bash
sudo chmod 600 /etc/excload-coupang-proxy.env
```

| 변수 | 설명 |
|------|------|
| `COUPANG_PROXY_SHARED_SECRET` | Vercel과 **동일** (나중에 Vercel에도 입력) |
| `PORT` | 내부 listen 포트 (Caddy가 443 → 8787으로 전달) |

쿠팡 Access Key / Secret Key는 **프록시에 저장하지 않습니다.**

---

## Step 9. systemd로 프록시 상시 실행

레포의 `services/coupang-proxy/excload-coupang-proxy.service.example` 내용을 서비스 파일로 등록합니다.

```bash
sudo nano /etc/systemd/system/excload-coupang-proxy.service
```

(예시 파일 내용 그대로 붙여넣기 — `User=ubuntu`, `WorkingDirectory=/opt/excload-coupang-proxy` 확인)

```bash
sudo systemctl daemon-reload
sudo systemctl enable excload-coupang-proxy
sudo systemctl start excload-coupang-proxy
sudo systemctl status excload-coupang-proxy
```

`active (running)` 확인.

**내부 health (아직 HTTPS 전):**

```bash
curl -s http://127.0.0.1:8787/healthz
```

기대: `{"ok":true}`

---

## Step 10. Caddy 설치 + HTTPS 자동 설정

Caddy가 **Let's Encrypt** 인증서를 자동 발급·갱신합니다. (Step 4 DNS + Step 3 포트 80/443 필요)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Caddyfile 편집:

```bash
sudo nano /etc/caddy/Caddyfile
```

**아래만** 넣습니다 (다른 사이트 블록이 있으면 이 블록 추가):

```text
coupang-proxy.excload.com {
    reverse_proxy localhost:8787
}
```

적용:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Caddy가 자동으로:

- `http://coupang-proxy.excload.com` → HTTPS 리다이렉트
- `https://coupang-proxy.excload.com` TLS 인증서 발급

**인증서 발급 실패 시 흔한 원인:**

- DNS A 레코드가 아직 Static IP를 가리키지 않음 → Step 4 재확인
- Lightsail 방화벽 **80·443** 미개방 → Step 3 재확인
- 도메인 오타 (`coupang-proxy.excload.com`)

---

## Step 11. `/healthz` 최종 확인

**서버 안에서:**

```bash
curl -s https://coupang-proxy.excload.com/healthz
```

**로컬 PC에서:**

```bash
curl -s https://coupang-proxy.excload.com/healthz
```

기대 응답:

```json
{"ok":true}
```

> 경로는 **`/healthz`** (`/health` 아님)

**outbound IP 확인** (WING 등록 IP와 일치해야 함):

```bash
curl -s https://checkip.amazonaws.com
```

→ Step 2 Static IP와 **동일**해야 합니다.

---

## Step 12. (나중에) Vercel 환경변수

Lightsail·Caddy·healthz까지 끝난 **후** Vercel Dashboard → Settings → Environment Variables → **Production**:

```env
COUPANG_PROXY_BASE_URL=https://coupang-proxy.excload.com
COUPANG_PROXY_SHARED_SECRET=<Step 8과 동일한 값>
NEXT_PUBLIC_EXCLOAD_OUTBOUND_IP=<Step 2 Lightsail Static IP>
```

- `COUPANG_PROXY_BASE_URL`: **`https://`**, 끝 **`/` 없음**
- `NEXT_PUBLIC_*` 변경 후 **Redeploy 필수**

배포 후 관리자 → 쿠팡 연동 화면 상단:

- **「고정 IP 프록시」** → proxy 모드 OK
- IP 복사 버튼 = WING에 넣을 IP

---

## Step 13. 쿠팡 WING + 연결 테스트

**WING (Open API Key 발급):**

| 항목 | 값 |
|------|-----|
| 업체명 | 엑클로드 |
| URL | excload.com |
| **IP** | **Lightsail Static IP** (Vercel IP ❌) |

엑클로드 **주문연동 → 쿠팡** → 키 저장 → **연결 테스트**

성공 메시지: 「쿠팡 API 연결이 정상 확인되었습니다.」

IP/키 변경 후 최대 **30분** 반영 지연 가능.

---

## Step 13. 워치독(자동 재시작·먹통 리부트)

프로세스만 죽으면 systemd `Restart=always`로 충분합니다.  
**머신 전체가 굳는 경우**(512MB OOM 등)는 사람이 Lightsail에서 리부트해야 했는데, 워치독이 그 역할을 대신합니다.

| 동작 | 조건 |
|------|------|
| 서비스 재시작 | 로컬 `http://127.0.0.1:8787/healthz` 실패 |
| 머신 리부트 | 연속 **3회**(기본, 약 6분) 실패 + 재시작으로도 미복구 |
| 리부트 쿨다운 | 기본 **1시간**에 1회만 (재부팅 루프 방지) |

### 서버에 설치 (Lightsail SSH)

`services/coupang-proxy/` 를 `/opt/excload-coupang-proxy/` 에 동기화한 뒤:

```bash
cd /opt/excload-coupang-proxy
sudo bash install-watchdog.sh
```

수동 설치:

```bash
sudo install -m 755 /opt/excload-coupang-proxy/watchdog.sh \
  /usr/local/bin/excload-proxy-watchdog.sh
sudo cp /opt/excload-coupang-proxy/excload-proxy-watchdog.service.example \
  /etc/systemd/system/excload-proxy-watchdog.service
sudo cp /opt/excload-coupang-proxy/excload-proxy-watchdog.timer.example \
  /etc/systemd/system/excload-proxy-watchdog.timer
sudo cp /opt/excload-coupang-proxy/excload-coupang-proxy.service.example \
  /etc/systemd/system/excload-coupang-proxy.service
sudo systemctl daemon-reload
sudo systemctl restart excload-coupang-proxy
sudo systemctl enable --now excload-proxy-watchdog.timer
```

### 검증

```bash
sudo systemctl list-timers | grep excload
sudo systemctl start excload-proxy-watchdog.service
sudo journalctl -t excload-proxy-watchdog -n 20 --no-pager
curl -s http://127.0.0.1:8787/healthz
```

정상일 때 워치독은 로그 없이 조용히 끝납니다(실패 카운트 0).

### 리부트 끄기 (테스트용)

`/etc/systemd/system/excload-proxy-watchdog.service`에:

```ini
Environment=EXCLOAD_PROXY_WATCHDOG_ALLOW_REBOOT=0
```

적용: `sudo systemctl daemon-reload`

### 권장 (장기)

- Lightsail **1GB RAM** 이상 — 먹통 빈도 자체를 줄임
- 외부 업타임 모니터에 `https://coupang-proxy.excload.com/healthz` 등록(알림용)

---

## 전체 체크리스트 (한 페이지)

| # | 항목 | 확인 |
|---|------|------|
| 1 | Lightsail 서울 $5 Ubuntu Running | ☐ |
| 2 | Static IP Attach + IP 메모 | ☐ |
| 3 | 방화벽 22, 80, 443 | ☐ |
| 4 | DNS A `coupang-proxy` → Static IP | ☐ |
| 5 | `server.mjs` + systemd running | ☐ |
| 6 | `curl http://127.0.0.1:8787/healthz` → ok | ☐ |
| 7 | Caddy + `coupang-proxy.excload.com` TLS | ☐ |
| 8 | `curl https://coupang-proxy.excload.com/healthz` → ok | ☐ |
| 9 | `checkip.amazonaws.com` = Static IP | ☐ |
| 10 | Vercel env 3종 + Redeploy | ☐ |
| 11 | WING IP = Static IP | ☐ |
| 12 | 관리자 연결 테스트 성공 | ☐ |
| 13 | `excload-proxy-watchdog.timer` active | ☐ |

---

## 연결 테스트 실패 시

| 증상 | 확인 |
|------|------|
| `https://.../healthz` 실패 | DNS, 방화벽 443, Caddy 로그 `sudo journalctl -u caddy -n 30` |
| UI 「Vercel 직접 호출」 | Vercel `COUPANG_PROXY_*` 둘 다 + Redeploy |
| 「프록시 서버에 연결하지 못…」 | BASE_URL 오타, Caddy/프록시 다운 |
| 「WING 고정 IP…」 | WING에 **Vercel IP 넣지 않았는지**, Static IP 맞는지 |
| 「API Key / Secret…」 | Wing 키·업체코드 재확인 |
| invalid proxy signature | Vercel·서버 `COUPANG_PROXY_SHARED_SECRET` 동일 여부 |
| 자주 먹통·리부트 | RAM 512MB → 1GB+, `journalctl -t excload-proxy-watchdog` |

---

## 운영 명령 모음

```bash
# 프록시
sudo systemctl status excload-coupang-proxy
sudo systemctl restart excload-coupang-proxy
sudo journalctl -u excload-coupang-proxy -f

# Caddy
sudo systemctl status caddy
sudo systemctl reload caddy
sudo journalctl -u caddy -f

# 워치독
sudo systemctl status excload-proxy-watchdog.timer
sudo systemctl list-timers | grep excload
sudo journalctl -t excload-proxy-watchdog -f
sudo systemctl start excload-proxy-watchdog.service   # 즉시 1회 실행
```

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| [`coupang-proxy-transport.md`](./coupang-proxy-transport.md) | Vercel↔프록시 API 계약 |
| [`services/coupang-proxy/`](../services/coupang-proxy/) | `server.mjs`, systemd·워치독 예시 |

---

## 보류

- 일반 사용자 주문연동 공개
- 수집 주문 → 택배주문변환 미리보기 주입
- EC2 / Vercel Static IP

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-06 | 서울 Lightsail · coupang-proxy.excload.com · Caddy 순서 가이드 |
| 2026-07-24 | Step 13 워치독(healthz→재시작→리부트) · systemd MemoryMax |
