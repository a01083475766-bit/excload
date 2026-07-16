/**
 * 스마트스토어 연결 UI 실브라우저 확인 (읽기 전용, 코드/DB 변경 없음)
 *
 * 전제: 로그인된 크롬을 원격 디버깅 포트(9222)로 띄워 둔 상태.
 *   chrome.exe --remote-debugging-port=9222 --user-data-dir="<기본 프로필>"
 *
 * 동작:
 *   1) /order/integration/connect (전체 탭) 캡처
 *   2) connected-malls API 응답을 읽어 Secret 노출 여부/계정명 확인
 *   3) 스마트스토어 칩 클릭 → 설정 화면 캡처
 *   4) '주문 수집' 버튼/미리보기 제거, 연결 테스트·해제·이동 버튼 존재 확인
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp-smartstore-check');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CDP = process.env.CDP_URL ?? 'http://localhost:9222';

const log = (...a) => console.log(...a);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 1 });

  // --- 1) connect 페이지 진입 ---
  await page.goto(`${BASE}/order/integration/connect`, {
    waitUntil: 'networkidle2',
    timeout: 120000,
  });

  // 로그인 여부 확인 (로그인 페이지로 튕겼는지)
  const url = page.url();
  const isLogin = /\/auth\/login/.test(url);
  log('현재 URL:', url, isLogin ? '(로그인 필요 — 세션 없음)' : '');
  if (isLogin) {
    await page.screenshot({ path: path.join(OUT_DIR, '00-login-required.png') });
    log('로그인 세션이 없어 인증 화면으로 이동했습니다. 로그인된 프로필로 크롬을 띄웠는지 확인하세요.');
    await browser.disconnect();
    return;
  }

  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, '01-all-tab.png'), fullPage: true });
  log('저장: 01-all-tab.png (전체 탭)');

  // --- 2) connected-malls API 응답 확인 ---
  const apiResult = await page.evaluate(async () => {
    const res = await fetch('/api/order/integration/connected-malls');
    const text = await res.text();
    return { status: res.status, text };
  });
  const rawLower = apiResult.text.toLowerCase();
  const secretLeak =
    rawLower.includes('secret') || rawLower.includes('clientsecret') || rawLower.includes('apikey');
  log('connected-malls status:', apiResult.status);
  log('connected-malls 본문:', apiResult.text);
  log('Secret/apiKey 문자열 노출 여부:', secretLeak ? '⚠️ 발견' : '없음');

  // --- 3) 스마트스토어 칩 클릭 ---
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find((b) => (b.textContent ?? '').includes('스마트스토어'));
    if (target) {
      target.click();
      return true;
    }
    return false;
  });
  log('스마트스토어 칩 클릭:', clicked ? '성공' : '실패(칩 없음)');
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, '02-smartstore-settings.png'), fullPage: true });
  log('저장: 02-smartstore-settings.png (스마트스토어 설정 화면)');

  // --- 4) 설정 화면 요소 확인 ---
  const checks = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const btnTexts = Array.from(document.querySelectorAll('button, a')).map((b) =>
      (b.textContent ?? '').trim()
    );
    const has = (t) => btnTexts.some((x) => x.includes(t));
    return {
      hasFetchButton: has('주문 수집'),
      hasPreviewTable: bodyText.includes('수집 결과 미리보기') || bodyText.includes('수집 미리보기'),
      hasSaveButton: has('저장'),
      hasTestButton: has('연결 테스트'),
      hasDisconnectButton: has('연동 해제'),
      hasConnectedNotice: bodyText.includes('연결이 완료되었습니다'),
      hasGoToIntegration: has('주문연동으로 이동'),
    };
  });
  log('\n=== 스마트스토어 설정 화면 점검 ===');
  log("'주문 수집' 버튼 제거:", checks.hasFetchButton ? '❌ 아직 있음' : '✅ 제거됨');
  log('수집 미리보기 표 제거:', checks.hasPreviewTable ? '❌ 아직 있음' : '✅ 제거됨');
  log("'저장' 버튼:", checks.hasSaveButton ? '✅ 있음' : '❌ 없음');
  log("'연결 테스트' 버튼:", checks.hasTestButton ? '✅ 있음' : '❌ 없음');
  log("'연동 해제' 버튼:", checks.hasDisconnectButton ? '✅ 있음' : '❌ 없음');
  log('연결 완료 안내:', checks.hasConnectedNotice ? '✅ 표시' : '⚠️ 미표시(미저장 상태일 수 있음)');
  log("'주문연동으로 이동' 버튼:", checks.hasGoToIntegration ? '✅ 있음' : '⚠️ 없음(미저장 상태일 수 있음)');

  await page.close();
  await browser.disconnect();
  log('\n완료. 스크린샷 폴더:', OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
