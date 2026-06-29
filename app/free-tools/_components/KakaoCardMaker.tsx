'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Copy, Download, Image as ImageIcon, Link as LinkIcon, RefreshCw, Share2, Upload } from 'lucide-react';
import QRCode from 'qrcode';
import { canvasToBlobWithFallback } from '@/app/free-tools/_utils/browserCompatibility';

type CardSize = 'landscape' | 'square';
type TemplateId = 'simple' | 'store' | 'seller' | 'food' | 'dark';
type BackgroundFit = 'cover' | 'contain' | 'blur';
type UploadedImage = { dataUrl: string; name: string };

type FormState = {
  name: string;
  business: string;
  tagline: string;
  phone: string;
  address: string;
  link: string;
  intro: string;
  hours: string;
};

type Theme = {
  name: string;
  background: string;
  pattern: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  dark: boolean;
};

const cardSizes: Record<CardSize, { label: string; width: number; height: number; description: string }> = {
  landscape: { label: '가로형', width: 940, height: 540, description: '카톡/문자 공유용' },
  square: { label: '정사각형', width: 1080, height: 1080, description: '인스타/모바일 홍보용' },
};

const templateOptions: { id: TemplateId; label: string; description: string }[] = [
  { id: 'simple', label: '심플형', description: '깔끔한 기본 명함' },
  { id: 'store', label: '가게 홍보형', description: '매장 정보 강조' },
  { id: 'seller', label: '쇼핑몰 셀러형', description: '링크와 소개 강조' },
  { id: 'food', label: '음식점/배달형', description: '안내 문구 강조' },
  { id: 'dark', label: '고급 다크형', description: '어두운 고급 톤' },
];

const themes: Record<TemplateId, Theme> = {
  simple: {
    name: '심플형',
    background: 'linear-gradient(135deg, #eef6ff 0%, #ffffff 45%, #e8f8f1 100%)',
    pattern: 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.14), transparent 28%), radial-gradient(circle at 90% 10%, rgba(16,185,129,0.15), transparent 24%)',
    card: 'rgba(255,255,255,0.88)',
    text: '#111827',
    muted: '#4b5563',
    accent: '#2563eb',
    accentText: '#ffffff',
    dark: false,
  },
  store: {
    name: '가게 홍보형',
    background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 46%, #fde68a 100%)',
    pattern: 'radial-gradient(circle at 12% 18%, rgba(249,115,22,0.17), transparent 26%), radial-gradient(circle at 85% 80%, rgba(234,179,8,0.22), transparent 30%)',
    card: 'rgba(255,251,235,0.9)',
    text: '#1f2937',
    muted: '#6b4e16',
    accent: '#f97316',
    accentText: '#ffffff',
    dark: false,
  },
  seller: {
    name: '쇼핑몰 셀러형',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #ccfbf1 100%)',
    pattern: 'linear-gradient(45deg, rgba(37,99,235,0.09) 25%, transparent 25%, transparent 50%, rgba(37,99,235,0.09) 50%, rgba(37,99,235,0.09) 75%, transparent 75%, transparent)',
    card: 'rgba(255,255,255,0.9)',
    text: '#0f172a',
    muted: '#475569',
    accent: '#0ea5e9',
    accentText: '#ffffff',
    dark: false,
  },
  food: {
    name: '음식점/배달형',
    background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 45%, #fef3c7 100%)',
    pattern: 'radial-gradient(circle at 30% 30%, rgba(244,63,94,0.16), transparent 25%), radial-gradient(circle at 75% 70%, rgba(251,146,60,0.18), transparent 28%)',
    card: 'rgba(255,255,255,0.88)',
    text: '#1f2937',
    muted: '#7f1d1d',
    accent: '#e11d48',
    accentText: '#ffffff',
    dark: false,
  },
  dark: {
    name: '고급 다크형',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #111827 100%)',
    pattern: 'radial-gradient(circle at 18% 20%, rgba(59,130,246,0.22), transparent 26%), radial-gradient(circle at 82% 78%, rgba(168,85,247,0.22), transparent 28%)',
    card: 'rgba(15,23,42,0.82)',
    text: '#f8fafc',
    muted: '#cbd5e1',
    accent: '#60a5fa',
    accentText: '#0f172a',
    dark: true,
  },
};

const randomThemes: Pick<Theme, 'background' | 'pattern' | 'accent'>[] = [
  { background: 'linear-gradient(135deg, #ecfeff 0%, #d1fae5 52%, #f0fdfa 100%)', pattern: 'radial-gradient(circle at 20% 20%, rgba(20,184,166,0.18), transparent 28%)', accent: '#0d9488' },
  { background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #f5f3ff 100%)', pattern: 'radial-gradient(circle at 85% 15%, rgba(37,99,235,0.18), transparent 28%)', accent: '#2563eb' },
  { background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 52%, #fffbeb 100%)', pattern: 'radial-gradient(circle at 12% 80%, rgba(217,119,6,0.16), transparent 30%)', accent: '#d97706' },
  { background: 'linear-gradient(135deg, #fdf2f8 0%, #ffe4e6 50%, #fff7ed 100%)', pattern: 'radial-gradient(circle at 80% 20%, rgba(219,39,119,0.14), transparent 28%)', accent: '#db2777' },
  { background: 'linear-gradient(135deg, #111827 0%, #334155 55%, #020617 100%)', pattern: 'radial-gradient(circle at 80% 20%, rgba(148,163,184,0.2), transparent 30%)', accent: '#94a3b8' },
  { background: 'linear-gradient(135deg, #f8fafc 0%, #e5e7eb 50%, #f1f5f9 100%)', pattern: 'linear-gradient(135deg, rgba(100,116,139,0.08) 25%, transparent 25%, transparent 50%, rgba(100,116,139,0.08) 50%, rgba(100,116,139,0.08) 75%, transparent 75%, transparent)', accent: '#475569' },
];

const initialForm: FormState = {
  name: '홍길동',
  business: '엑클로드',
  tagline: '온라인 주문 정리 도구',
  phone: '010-0000-0000',
  address: '인천 미추홀구 ...',
  link: 'https://www.excload.com',
  intro: '쇼핑몰 주문 정리를 빠르게 도와드립니다.',
  hours: '평일 09:00 - 18:00',
};

function isImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = src;
  });
}

async function resizeImageDataUrl(file: File, maxSize = 1800) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  if (ratio >= 1) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * ratio);
  canvas.height = Math.round(image.naturalHeight * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_failed');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.88);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, contain = false) {
  const scale = contain ? Math.min(width / image.naturalWidth, height / image.naturalHeight) : Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function getCssBackground(theme: Theme, backgroundImage: UploadedImage | null, backgroundFit: BackgroundFit) {
  if (!backgroundImage) return `${theme.pattern}, ${theme.background}`;
  if (backgroundFit === 'contain') return `url("${backgroundImage.dataUrl}"), ${theme.pattern}, ${theme.background}`;
  return `linear-gradient(135deg, rgba(15,23,42,0.10), rgba(255,255,255,0.12)), url("${backgroundImage.dataUrl}")`;
}

export function KakaoCardMaker() {
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [cardSize, setCardSize] = useState<CardSize>('landscape');
  const [templateId, setTemplateId] = useState<TemplateId>('simple');
  const [backgroundFit, setBackgroundFit] = useState<BackgroundFit>('cover');
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null);
  const [logoImage, setLogoImage] = useState<UploadedImage | null>(null);
  const [showQr, setShowQr] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [randomTheme, setRandomTheme] = useState<Pick<Theme, 'background' | 'pattern' | 'accent'> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseTheme = themes[templateId];
  const theme = useMemo<Theme>(
    () => ({
      ...baseTheme,
      ...(randomTheme
        ? {
            background: randomTheme.background,
            pattern: randomTheme.pattern,
            accent: randomTheme.accent,
          }
        : {}),
    }),
    [baseTheme, randomTheme],
  );
  const size = cardSizes[cardSize];
  const visibleLines = [
    form.phone && `전화 ${form.phone}`,
    form.address,
    form.link,
    form.hours,
  ].filter(Boolean) as string[];

  useEffect(() => {
    let cancelled = false;
    async function buildQr() {
      if (!form.link.trim() || !showQr) {
        setQrDataUrl('');
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(form.link.trim(), { width: 180, margin: 1, color: { dark: '#111827', light: '#ffffff' } });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl('');
      }
    }
    void buildQr();
    return () => {
      cancelled = true;
    };
  }, [form.link, showQr]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleImageUpload = async (file: File | undefined, kind: 'background' | 'logo') => {
    if (!file) return;
    if (!isImageFile(file)) {
      setMessage('JPG, PNG, WEBP 이미지만 올릴 수 있습니다.');
      return;
    }
    try {
      const dataUrl = await resizeImageDataUrl(file, kind === 'background' ? 1800 : 800);
      const uploaded = { dataUrl, name: file.name };
      if (kind === 'background') setBackgroundImage(uploaded);
      else setLogoImage(uploaded);
      setMessage(null);
    } catch {
      setMessage('이미지를 읽지 못했습니다. 다른 이미지로 다시 시도해 주세요.');
    }
  };

  const drawCardToCanvas = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_failed');

    const padding = cardSize === 'square' ? 74 : 54;
    const cardRadius = cardSize === 'square' ? 42 : 34;
    const titleSize = cardSize === 'square' ? 74 : 50;
    const bizSize = cardSize === 'square' ? 44 : 30;
    const bodySize = cardSize === 'square' ? 31 : 23;
    const smallSize = cardSize === 'square' ? 25 : 19;
    const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    const bgImage = backgroundImage ? await loadImage(backgroundImage.dataUrl) : null;

    context.fillStyle = theme.dark ? '#0f172a' : '#f8fafc';
    context.fillRect(0, 0, size.width, size.height);
    if (bgImage) {
      if (backgroundFit === 'blur') {
        context.save();
        context.filter = 'blur(18px)';
        drawCoverImage(context, bgImage, -24, -24, size.width + 48, size.height + 48);
        context.restore();
        context.fillStyle = theme.dark ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.62)';
        context.fillRect(0, 0, size.width, size.height);
      } else {
        drawCoverImage(context, bgImage, 0, 0, size.width, size.height, backgroundFit === 'contain');
        if (backgroundFit === 'contain') {
          context.fillStyle = theme.dark ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.28)';
          context.fillRect(0, 0, size.width, size.height);
        }
      }
    } else {
      const gradient = context.createLinearGradient(0, 0, size.width, size.height);
      gradient.addColorStop(0, theme.dark ? '#0f172a' : '#f8fafc');
      gradient.addColorStop(1, theme.accent);
      context.globalAlpha = theme.dark ? 0.5 : 0.18;
      context.fillStyle = gradient;
      context.fillRect(0, 0, size.width, size.height);
      context.globalAlpha = 1;
    }

    drawRoundedRect(context, padding, padding, size.width - padding * 2, size.height - padding * 2, cardRadius);
    context.fillStyle = theme.card;
    context.fill();

    const innerX = padding + (cardSize === 'square' ? 56 : 46);
    const innerY = padding + (cardSize === 'square' ? 58 : 44);
    const innerW = size.width - padding * 2 - (cardSize === 'square' ? 112 : 92);
    let y = innerY;

    if (logoImage) {
      const logo = await loadImage(logoImage.dataUrl);
      const logoSize = cardSize === 'square' ? 122 : 86;
      context.save();
      drawRoundedRect(context, innerX, y, logoSize, logoSize, 24);
      context.clip();
      drawCoverImage(context, logo, innerX, y, logoSize, logoSize);
      context.restore();
      y += logoSize + (cardSize === 'square' ? 36 : 22);
    }

    if (form.business.trim()) {
      context.font = `700 ${bizSize}px ${font}`;
      context.fillStyle = theme.accent;
      context.fillText(form.business.trim(), innerX, y);
      y += bizSize + 16;
    }
    if (form.name.trim()) {
      context.font = `900 ${titleSize}px ${font}`;
      context.fillStyle = theme.text;
      context.fillText(form.name.trim(), innerX, y);
      y += titleSize + 14;
    }
    if (form.tagline.trim()) {
      context.font = `600 ${bodySize}px ${font}`;
      context.fillStyle = theme.muted;
      context.fillText(form.tagline.trim(), innerX, y);
      y += bodySize + 24;
    }
    if (form.intro.trim()) {
      context.font = `500 ${bodySize}px ${font}`;
      context.fillStyle = theme.text;
      wrapText(context, form.intro.trim(), innerW * (qrDataUrl ? 0.72 : 0.94)).slice(0, 3).forEach((line) => {
        context.fillText(line, innerX, y);
        y += bodySize + 10;
      });
      y += 8;
    }

    context.font = `500 ${smallSize}px ${font}`;
    context.fillStyle = theme.muted;
    visibleLines.slice(0, cardSize === 'square' ? 5 : 4).forEach((line) => {
      context.fillText(String(line), innerX, y);
      y += smallSize + 12;
    });

    if (qrDataUrl) {
      const qr = await loadImage(qrDataUrl);
      const qrSize = cardSize === 'square' ? 170 : 126;
      const qrX = size.width - padding - qrSize - (cardSize === 'square' ? 56 : 42);
      const qrY = size.height - padding - qrSize - (cardSize === 'square' ? 88 : 66);
      drawRoundedRect(context, qrX - 12, qrY - 12, qrSize + 24, qrSize + 46, 24);
      context.fillStyle = '#ffffff';
      context.fill();
      context.drawImage(qr, qrX, qrY, qrSize, qrSize);
      context.font = `700 ${smallSize}px ${font}`;
      context.fillStyle = '#111827';
      context.textAlign = 'center';
      context.fillText('바로가기', qrX + qrSize / 2, qrY + qrSize + 28);
      context.textAlign = 'left';
    }

    drawRoundedRect(context, padding, padding, size.width - padding * 2, size.height - padding * 2, cardRadius);
    context.strokeStyle = theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(37,99,235,0.12)';
    context.lineWidth = 2;
    context.stroke();
    return canvas;
  };

  const makePngBlob = async () => canvasToBlobWithFallback(await drawCardToCanvas(), 'image/png');

  const saveImage = async () => {
    try {
      setBusy(true);
      downloadBlob(await makePngBlob(), 'kakao-card.png');
      setMessage('이미지로 저장했습니다.');
    } catch {
      setMessage('이미지 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const copyImage = async () => {
    try {
      setBusy(true);
      const blob = await makePngBlob();
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        setMessage('이 브라우저는 이미지 복사를 지원하지 않습니다. 이미지 저장을 사용해 주세요.');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setMessage('이미지를 클립보드에 복사했습니다.');
    } catch {
      setMessage('이미지 복사를 지원하지 않는 브라우저입니다. 이미지 저장을 사용해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const shareImage = async () => {
    try {
      setBusy(true);
      const blob = await makePngBlob();
      const file = new File([blob], 'kakao-card.png', { type: 'image/png' });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        setMessage('이미지를 저장한 뒤 카톡/문자에 첨부해 주세요.');
        return;
      }
      await navigator.share({ title: '카톡 명함', text: '이미지 명함을 공유합니다.', files: [file] });
    } catch {
      setMessage('공유가 취소되었거나 지원되지 않습니다. 저장 후 첨부해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const randomizeBackground = () => {
    const next = randomThemes[Math.floor(Math.random() * randomThemes.length)];
    setRandomTheme(next);
    setBackgroundImage(null);
  };

  const previewStyle = {
    aspectRatio: `${size.width} / ${size.height}`,
    color: theme.text,
    backgroundImage: getCssBackground(theme, backgroundImage, backgroundFit),
    backgroundSize: backgroundImage ? (backgroundFit === 'contain' ? 'contain, cover, cover' : 'cover, cover') : 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">정보 입력</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              필요한 정보만 입력하면 명함 이미지에 자동으로 반영됩니다. 비워 둔 줄은 명함에서 숨겨집니다.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            ['name', '이름', '홍길동'],
            ['business', '상호/가게명', '엑클로드'],
            ['tagline', '직함/짧은 설명', '온라인 주문 정리 도구'],
            ['phone', '전화번호', '010-0000-0000'],
            ['address', '주소', '인천 미추홀구 ...'],
            ['link', '홈페이지/스마트스토어/인스타 등 링크', 'https://www.excload.com'],
            ['intro', '짧은 소개문', '쇼핑몰 주문 정리를 빠르게 도와드립니다.'],
            ['hours', '영업시간 또는 안내문구', '평일 09:00 - 18:00'],
          ].map(([key, label, placeholder]) => (
            <label key={key} className={key === 'intro' ? 'block sm:col-span-2' : 'block'}>
              <span className="text-xs font-semibold text-zinc-600">{label}</span>
              <input
                value={form[key as keyof FormState]}
                onChange={(event) => updateForm(key as keyof FormState, event.target.value)}
                placeholder={placeholder}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">명함 사이즈</p>
            <div className="mt-3 grid gap-2">
              {(Object.keys(cardSizes) as CardSize[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCardSize(key)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm ${
                    cardSize === key ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-zinc-200 bg-white text-zinc-700'
                  }`}
                >
                  <span className="font-bold">{cardSizes[key].label}</span>
                  <span className="ml-2 text-xs text-zinc-500">{cardSizes[key].description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">QR코드</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <input type="checkbox" checked={showQr} disabled={!form.link.trim()} onChange={(event) => setShowQr(event.target.checked)} />
              링크가 있으면 QR코드 표시
            </label>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              링크가 없으면 QR코드를 넣지 않습니다. QR 아래에는 “바로가기” 문구가 표시됩니다.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-950">디자인 템플릿</p>
              <p className="mt-1 text-xs text-zinc-500">복잡한 편집 없이 템플릿만 골라 빠르게 만듭니다.</p>
            </div>
            <button
              type="button"
              onClick={randomizeBackground}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              <RefreshCw className="size-4" aria-hidden />
              랜덤 배경
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {templateOptions.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setTemplateId(template.id);
                  setRandomTheme(null);
                }}
                className={`rounded-lg border px-3 py-3 text-left ${
                  templateId === template.id ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                <span className="block text-sm font-bold">{template.label}</span>
                <span className="mt-1 block text-xs text-zinc-500">{template.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-bold text-zinc-950">배경 이미지 업로드</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              올린 사진은 명함 크기에 맞게 자동으로 정리됩니다. 본인이 사용할 권리가 있는 이미지와 로고만 업로드해 주세요.
            </p>
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600"
            >
              <Upload className="size-4" aria-hidden />
              배경 선택
            </button>
            <input
              ref={bgInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void handleImageUpload(event.target.files?.[0], 'background')}
            />
            <div className="mt-3 grid gap-2">
              {[
                ['cover', '꽉 채우기'],
                ['contain', '전체 보이기'],
                ['blur', '흐림 배경'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="radio" name="backgroundFit" checked={backgroundFit === value} onChange={() => setBackgroundFit(value as BackgroundFit)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-bold text-zinc-950">로고 이미지 업로드</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              로고를 올리면 명함에 둥근 사각형으로 표시합니다. 올리지 않으면 로고 영역은 숨겨집니다.
            </p>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600"
            >
              <Upload className="size-4" aria-hidden />
              로고 선택
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void handleImageUpload(event.target.files?.[0], 'logo')}
            />
            {logoImage ? <p className="mt-3 truncate text-xs font-semibold text-blue-700">{logoImage.name}</p> : null}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm leading-relaxed text-blue-900">
          입력한 정보와 이미지는 서버에 저장하지 않고, 브라우저에서만 명함 이미지로 변환됩니다.
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-32 xl:self-start">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-zinc-950">명함 미리보기</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              입력값이 바뀌면 바로 반영됩니다. 실제 저장되는 이미지와 최대한 비슷하게 보입니다.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            {size.width} × {size.height}px
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 p-3">
          <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl bg-cover bg-center shadow-lg" style={previewStyle}>
            <div className={`flex h-full w-full p-[6%] ${backgroundFit === 'blur' ? 'backdrop-blur-sm' : ''}`}>
              <div
                className="relative flex h-full w-full flex-col rounded-[6%] p-[7%] shadow-sm"
                style={{ background: theme.card, color: theme.text }}
              >
                {logoImage ? (
                  <img src={logoImage.dataUrl} alt="로고 미리보기" className="mb-[4%] size-[16%] rounded-2xl object-cover" />
                ) : null}
                {form.business.trim() ? (
                  <p className="text-[clamp(13px,2.8vw,24px)] font-black" style={{ color: theme.accent }}>
                    {form.business}
                  </p>
                ) : null}
                {form.name.trim() ? <p className="mt-1 text-[clamp(26px,6vw,52px)] font-black leading-tight">{form.name}</p> : null}
                {form.tagline.trim() ? (
                  <p className="mt-2 text-[clamp(13px,2.7vw,22px)] font-semibold" style={{ color: theme.muted }}>
                    {form.tagline}
                  </p>
                ) : null}
                {form.intro.trim() ? <p className="mt-[5%] max-w-[76%] text-[clamp(12px,2.4vw,20px)] font-medium leading-relaxed">{form.intro}</p> : null}
                <div className="mt-auto space-y-1 text-[clamp(10px,2vw,18px)] font-medium" style={{ color: theme.muted }}>
                  {visibleLines.map((line) => (
                    <p key={line} className="truncate">{line}</p>
                  ))}
                </div>
                {qrDataUrl ? (
                  <div className="absolute bottom-[8%] right-[7%] rounded-2xl bg-white p-2 text-center shadow-sm">
                    <img src={qrDataUrl} alt="바로가기 QR코드" className="size-16 sm:size-20" />
                    <p className="mt-1 text-[10px] font-bold text-zinc-900">바로가기</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void saveImage()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            <Download className="size-4" aria-hidden />
            이미지 저장
          </button>
          <button
            type="button"
            onClick={() => void copyImage()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            <Copy className="size-4" aria-hidden />
            이미지 복사
          </button>
          <button
            type="button"
            onClick={() => void shareImage()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
          >
            <Share2 className="size-4" aria-hidden />
            공유하기
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-600">
          <p className="font-semibold text-zinc-900">만든 명함은 이미지로 저장할 수 있습니다.</p>
          <p className="mt-1">모바일에서는 공유 버튼으로 카톡이나 문자에 보낼 수 있고, PC에서는 저장 후 첨부하면 됩니다.</p>
        </div>

        {message ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800" role="status">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{message}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500">
          {['이미지', '명함', '카톡', '소상공인'].map((tag) => (
            <span key={tag} className="rounded-full bg-zinc-100 px-3 py-1">#{tag}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
