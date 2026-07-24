#!/bin/bash
# Lightsail에서: sudo bash install-watchdog.sh
# (이 파일이 services/coupang-proxy/ 안에 있다고 가정)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_SRC="${ROOT}/watchdog.sh"
SERVICE_SRC="${ROOT}/excload-proxy-watchdog.service.example"
TIMER_SRC="${ROOT}/excload-proxy-watchdog.timer.example"
PROXY_SERVICE_SRC="${ROOT}/excload-coupang-proxy.service.example"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "root로 실행하세요: sudo bash $0" >&2
  exit 1
fi

for f in "$SCRIPT_SRC" "$SERVICE_SRC" "$TIMER_SRC"; do
  if [[ ! -f "$f" ]]; then
    echo "파일 없음: $f" >&2
    exit 1
  fi
done

install -m 755 "$SCRIPT_SRC" /usr/local/bin/excload-proxy-watchdog.sh
install -m 644 "$SERVICE_SRC" /etc/systemd/system/excload-proxy-watchdog.service
install -m 644 "$TIMER_SRC" /etc/systemd/system/excload-proxy-watchdog.timer

if [[ -f "$PROXY_SERVICE_SRC" ]]; then
  install -m 644 "$PROXY_SERVICE_SRC" /etc/systemd/system/excload-coupang-proxy.service
fi

mkdir -p /var/lib/excload-proxy-watchdog
systemctl daemon-reload

if systemctl list-unit-files | grep -q '^excload-coupang-proxy.service'; then
  systemctl restart excload-coupang-proxy || true
fi

systemctl enable --now excload-proxy-watchdog.timer
systemctl start excload-proxy-watchdog.service || true

echo "OK: excload-proxy-watchdog.timer enabled"
systemctl list-timers --all | grep excload || true
curl -fsS --max-time 5 http://127.0.0.1:8787/healthz && echo || echo "(healthz 확인은 프록시 기동 후)"
