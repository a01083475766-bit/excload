import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import gifencPkg from 'gifenc';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifencPkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'landing', 'exports');
const OUT_GIF = path.join(OUT_DIR, process.env.OUT_NAME ?? 'landing-hero-animation.gif');

const URL = process.env.CAPTURE_URL ?? 'http://localhost:3000/excload';
const VIEWPORT_WIDTH = Number(process.env.VIEWPORT_WIDTH ?? 1280);
const VIEWPORT_HEIGHT = Number(process.env.VIEWPORT_HEIGHT ?? 820);
const FPS = Number(process.env.FPS ?? 10);
const DURATION_MS = Number(process.env.DURATION_MS ?? 7500);
const FRAME_DELAY_MS = 1000 / FPS;

function pngBufferToRgba(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, rgba: png.data };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 120000 });

  const heroHandle = await page.$('section.blue-unified-theme');
  if (!heroHandle) {
    throw new Error('히어로 섹션을 찾지 못했습니다. /excload 페이지가 실행 중인지 확인하세요.');
  }

  const box = await heroHandle.boundingBox();
  if (!box) {
    throw new Error('히어로 섹션 크기를 읽을 수 없습니다.');
  }

  const clip = {
    x: Math.max(0, Math.floor(box.x)),
    y: Math.max(0, Math.floor(box.y)),
    width: Math.min(VIEWPORT_WIDTH, Math.ceil(box.width)),
    height: Math.min(VIEWPORT_HEIGHT, Math.ceil(box.height)),
  };

  const frameCount = Math.ceil(DURATION_MS / FRAME_DELAY_MS);
  const frames = [];

  console.log(`캡처 시작: ${frameCount}프레임 (${FPS}fps, ${DURATION_MS}ms)`);

  for (let i = 0; i < frameCount; i += 1) {
    const buffer = await page.screenshot({ type: 'png', clip });
    frames.push(pngBufferToRgba(buffer));
    if (i === 0 || i === frameCount - 1 || i % 10 === 0) {
      console.log(`  frame ${i + 1}/${frameCount}`);
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_DELAY_MS));
  }

  await browser.close();

  const { width, height } = frames[0];
  const gif = GIFEncoder();

  for (let i = 0; i < frames.length; i += 1) {
    const palette = quantize(frames[i].rgba, 256);
    const index = applyPalette(frames[i].rgba, palette);
    gif.writeFrame(index, width, height, {
      palette,
      delay: Math.round(FRAME_DELAY_MS),
      repeat: 0,
      transparent: false,
    });
  }

  gif.finish();
  fs.writeFileSync(OUT_GIF, Buffer.from(gif.bytes()));
  const sizeMb = (fs.statSync(OUT_GIF).size / (1024 * 1024)).toFixed(2);
  console.log(`\n완료: ${OUT_GIF}`);
  console.log(`크기: ${sizeMb} MB`);
  console.log(`다운로드 URL(로컬): http://localhost:3000/landing/exports/${path.basename(OUT_GIF)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
