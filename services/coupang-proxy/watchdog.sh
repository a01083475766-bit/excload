#!/bin/bash
# Excload 고정 IP 프록시 워치독
# - 로컬 /healthz 실패 시 Node·Caddy 재시작
# - 연속 실패가 임계치를 넘으면 머신 리부트(전체 먹통 복구)
# - 리부트 쿨다운으로 재부팅 루프 방지
#
# 설치: excload-proxy-watchdog.timer (권장) 또는 cron
# 로그: journalctl -t excload-proxy-watchdog -f

set -eu

HEALTH_URL="${EXCLOAD_PROXY_HEALTH_URL:-http://127.0.0.1:8787/healthz}"
STATE_DIR="${EXCLOAD_PROXY_WATCHDOG_STATE_DIR:-/var/lib/excload-proxy-watchdog}"
FAIL_FILE="${STATE_DIR}/fail_count"
REBOOT_STAMP="${STATE_DIR}/last_reboot"
MAX_FAIL="${EXCLOAD_PROXY_WATCHDOG_MAX_FAIL:-3}"
REBOOT_COOLDOWN_SEC="${EXCLOAD_PROXY_WATCHDOG_REBOOT_COOLDOWN_SEC:-3600}"
CURL_TIMEOUT_SEC="${EXCLOAD_PROXY_WATCHDOG_CURL_TIMEOUT_SEC:-5}"
ALLOW_REBOOT="${EXCLOAD_PROXY_WATCHDOG_ALLOW_REBOOT:-1}"
PROXY_UNIT="${EXCLOAD_PROXY_SYSTEMD_UNIT:-excload-coupang-proxy}"
CADDY_UNIT="${EXCLOAD_CADDY_SYSTEMD_UNIT:-caddy}"

log() {
  logger -t excload-proxy-watchdog -- "$*"
  echo "excload-proxy-watchdog: $*"
}

mkdir -p "$STATE_DIR"
chmod 755 "$STATE_DIR" 2>/dev/null || true

read_fail() {
  if [[ -f "$FAIL_FILE" ]]; then
    cat "$FAIL_FILE" 2>/dev/null || echo 0
  else
    echo 0
  fi
}

write_fail() {
  echo "$1" >"$FAIL_FILE"
}

health_ok() {
  curl -fsS --max-time "$CURL_TIMEOUT_SEC" "$HEALTH_URL" >/dev/null 2>&1
}

restart_services() {
  log "restarting ${PROXY_UNIT} and ${CADDY_UNIT}"
  systemctl restart "$PROXY_UNIT" || true
  systemctl restart "$CADDY_UNIT" || true
  sleep 3
}

can_reboot() {
  [[ "$ALLOW_REBOOT" == "1" ]] || return 1
  if [[ ! -f "$REBOOT_STAMP" ]]; then
    return 0
  fi
  local last now
  last=$(cat "$REBOOT_STAMP" 2>/dev/null || echo 0)
  now=$(date +%s)
  if (( now - last >= REBOOT_COOLDOWN_SEC )); then
    return 0
  fi
  log "reboot skipped (cooldown ${REBOOT_COOLDOWN_SEC}s, last=${last})"
  return 1
}

do_reboot() {
  if ! can_reboot; then
    write_fail 0
    return 0
  fi
  date +%s >"$REBOOT_STAMP"
  write_fail 0
  log "rebooting after ${MAX_FAIL} consecutive healthz failures"
  /sbin/reboot
}

if health_ok; then
  write_fail 0
  exit 0
fi

fail=$(read_fail)
# 숫자가 아니면 0으로
case "$fail" in
  ''|*[!0-9]*) fail=0 ;;
esac
fail=$((fail + 1))
write_fail "$fail"
log "healthz fail count=${fail}/${MAX_FAIL} url=${HEALTH_URL}"

restart_services

if health_ok; then
  write_fail 0
  log "recovered after service restart"
  exit 0
fi

if (( fail >= MAX_FAIL )); then
  do_reboot
  exit 0
fi

log "still unhealthy after restart; will retry on next timer tick"
exit 1
