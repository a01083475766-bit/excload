'use client';

/**
 * 이미지 주문 변환 어댑터
 * 이미지 변환 / 이미지 주문 변환 / 이미지 OCR / 이미지 텍스트 추출
 *
 * ⚠️ CONSTITUTION.md v4.x 준수
 * ⚠️ 기존 Stage0/1/2/3 파이프라인 및 엑셀 변환 로직은 절대 수정하지 않습니다.
 *
 * 역할:
 * - 이미지 파일에서 OCR을 통해 텍스트를 추출합니다.
 * - tesseract.js를 createWorker 방식으로 사용합니다.
 * - 추출된 텍스트 문자열을 반환합니다.
 */

/**
 * 이미지 전처리 함수
 * OCR 정확도 향상을 위한 canvas 기반 전처리
 * - 2배 확대
 * - 그레이스케일 변환
 * - 이진화 (threshold: 160)
 *
 * @param file - 이미지 파일 (File 객체)
 * @returns 전처리된 HTMLCanvasElement
 */
async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(file);

  const scale = 2; // 2배 확대
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context를 생성할 수 없습니다.');
  }

  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray =
      0.3 * data[i] +
      0.59 * data[i + 1] +
      0.11 * data[i + 2];

    const threshold = 150; // 글자 획 보존을 위해 약간 낮춤
    const value = gray > threshold ? 255 : 0;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function correctCommonOcrErrors(text: string): string {
  // 전화번호/숫자 맥락에서 자주 발생하는 문자 오인식 보정
  const normalizeBetweenDigits = (
    source: string,
    pattern: RegExp,
    replacement: string
  ) => source.replace(pattern, (_m, a: string, b: string) => `${a}${replacement}${b}`);

  let numericFixed = text;
  numericFixed = normalizeBetweenDigits(numericFixed, /(\d)[oO](\d)/g, '0');
  numericFixed = normalizeBetweenDigits(numericFixed, /(\d)[lI|](\d)/g, '1');
  numericFixed = normalizeBetweenDigits(numericFixed, /(\d)[sS](\d)/g, '5');
  numericFixed = normalizeBetweenDigits(numericFixed, /(\d)[bB](\d)/g, '8');

  return numericFixed
    .replace(/[•·●▪■□]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, ' ');
}

function scoreTextQuality(text: string): number {
  if (!text) return 0;

  const trimmed = text.trim();
  if (!trimmed) return 0;

  const koreanMatches = trimmed.match(/[가-힣]/g) ?? [];
  const digitMatches = trimmed.match(/\d/g) ?? [];
  const phonePattern = /\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  const phoneMatches = trimmed.match(phonePattern) ?? [];
  const noisyChars = trimmed.match(/[^\w가-힣\s\-\/:(),.]/g) ?? [];

  return (
    koreanMatches.length * 2 +
    digitMatches.length +
    phoneMatches.length * 20 -
    noisyChars.length * 1.5
  );
}

async function runOcr(
  source: HTMLCanvasElement | File
): Promise<string> {
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(source, 'kor+eng', {
    // tesseract.js WorkerOptions에 없는 OCR 옵션 (런타임에서만 사용)
    tessedit_pageseg_mode: 6,
  } as Parameters<typeof Tesseract.recognize>[2]);
  return result.data.text ?? '';
}

/**
 * 이미지 파일에서 텍스트를 추출하는 어댑터
 *
 * @param imageFile - 이미지 파일 (File 객체)
 * @returns 추출된 텍스트 문자열
 *
 * 이미지 주문 변환 / 이미지 OCR / 이미지 텍스트 추출 기능
 */
export async function extractTextFromImage(
  imageFile: File
): Promise<string> {

  if (!imageFile || !(imageFile instanceof File)) {
    throw new Error('이미지 파일이 유효하지 않습니다.');
  }

  const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validImageTypes.includes(imageFile.type)) {
    throw new Error(`지원하지 않는 이미지 형식입니다. (${imageFile.type})`);
  }

  // OCR 전처리 단계
  const processedCanvas = await preprocessImage(imageFile);
  const [rawText, processedText] = await Promise.all([
    runOcr(imageFile),
    runOcr(processedCanvas),
  ]);

  const rawScore = scoreTextQuality(rawText);
  const processedScore = scoreTextQuality(processedText);
  const pickedText = processedScore >= rawScore ? processedText : rawText;

  return normalizeWhitespace(correctCommonOcrErrors(pickedText));
}
