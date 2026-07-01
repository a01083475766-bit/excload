'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Barcode, Download, Info, RotateCcw, ShieldCheck } from 'lucide-react';
import JsBarcode from 'jsbarcode';

type LabelSizeKey = 'small' | 'medium' | 'wide';
type BarcodeHeightKey = 'low' | 'normal' | 'high';

type LabelSize = {
  key: LabelSizeKey;
  label: string;
  widthMm: number;
  heightMm: number;
  previewWidth: number;
};

type LabelForm = {
  productName: string;
  option: string;
  barcodeValue: string;
  sku: string;
  price: string;
  origin: string;
  manufactureDate: string;
  expirationDate: string;
  storage: string;
  brand: string;
  memo: string;
};

type LabelOptions = {
  showBarcodeValue: boolean;
  barcodeHeight: BarcodeHeightKey;
  showBorder: boolean;
};

const labelSizes: LabelSize[] = [
  { key: 'small', label: '소형 60×40mm · 작은 상품/봉투용', widthMm: 60, heightMm: 40, previewWidth: 330 },
  { key: 'medium', label: '중형 80×50mm · 일반 상품용', widthMm: 80, heightMm: 50, previewWidth: 430 },
  { key: 'wide', label: '대형 100×60mm · 박스/포장용', widthMm: 100, heightMm: 60, previewWidth: 520 },
];

const barcodeHeightOptions: Record<BarcodeHeightKey, { label: string; jsBarcodeHeight: number; svgHeight: number; previewClassName: string }> = {
  low: { label: '낮음', jsBarcodeHeight: 46, svgHeight: 66, previewClassName: 'h-12' },
  normal: { label: '보통', jsBarcodeHeight: 64, svgHeight: 94, previewClassName: 'h-16' },
  high: { label: '높음', jsBarcodeHeight: 84, svgHeight: 116, previewClassName: 'h-20' },
};

const initialOptions: LabelOptions = {
  showBarcodeValue: true,
  barcodeHeight: 'normal',
  showBorder: true,
};

const initialForm: LabelForm = {
  productName: '참치회 세트',
  option: '300g / 냉장',
  barcodeValue: '8801234567890',
  sku: 'TUNA-A001',
  price: '29,900원',
  origin: '국내산',
  manufactureDate: '',
  expirationDate: '',
  storage: '냉장보관',
  brand: '엑클로드',
  memo: '당일 발송 상품',
};

const inputClassName = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function downloadBlob(content: BlobPart, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getSafeFileName(productName: string, extension: 'png' | 'svg' | 'pdf') {
  const safeName = productName
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 36);

  return safeName ? `product-label-${safeName}.${extension}` : `product-label.${extension}`;
}

function createBarcodeSvg(value: string, height: number) {
  if (!value.trim()) {
    return { markup: '', error: null };
  }

  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      width: 1.8,
      height,
      lineColor: '#111827',
      background: '#ffffff',
    });

    return { markup: new XMLSerializer().serializeToString(svg), error: null };
  } catch {
    return {
      markup: '',
      error: 'CODE128로 표시할 수 없는 값입니다. 입력값을 직접 확인해 주세요. 값은 자동으로 수정하지 않습니다.',
    };
  }
}

function splitLines(value: string, maxLength: number, maxLines: number) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const lines: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0 && lines.length < maxLines) {
    if (remaining.length <= maxLength) {
      lines.push(remaining);
      break;
    }

    lines.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }

  return lines;
}

function svgText(text: string, x: number, y: number, className: string, anchor = 'start') {
  return `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
}

function buildLabelSvg(form: LabelForm, size: LabelSize, barcodeMarkup: string, options: LabelOptions) {
  const width = size.widthMm * 8;
  const height = size.heightMm * 8;
  const padding = 28;
  const labelItems = [
    ['원산지', form.origin],
    ['보관', form.storage],
    ['제조', form.manufactureDate],
    ['유통', form.expirationDate],
    ['SKU', form.sku],
    ['업체', form.brand],
  ].filter(([, value]) => value.trim());

  const titleLines = splitLines(form.productName || '상품명', size.key === 'wide' ? 24 : 18, 2);
  const memoLines = splitLines(form.memo, size.key === 'small' ? 22 : 32, 2);
  const price = form.price.trim();
  let y = padding + 22;
  const content: string[] = [];

  titleLines.forEach((line, index) => {
    content.push(svgText(line, padding, y + index * 25, 'title'));
  });
  y += Math.max(titleLines.length, 1) * 25 + 8;

  if (price) {
    content.push(svgText(price, width - padding, padding + 24, 'price', 'end'));
  }

  labelItems.slice(0, size.key === 'small' ? 5 : 7).forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemX = padding + column * ((width - padding * 2) / 2);
    const itemY = y + row * 22;
    content.push(svgText(`${label}: ${value}`, itemX, itemY, 'meta'));
  });

  y += Math.ceil(labelItems.length / 2) * 22 + 8;

  const barcodeY = Math.min(y + 4, height - 148);
  const barcodeHeight = Math.min(barcodeHeightOptions[options.barcodeHeight].svgHeight, size.key === 'small' ? 78 : 116);
  const barcodeWidth = width - padding * 2;
  const code = form.barcodeValue.trim();

  if (barcodeMarkup) {
    content.push(
      `<image x="${padding}" y="${barcodeY}" width="${barcodeWidth}" height="${barcodeHeight}" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(barcodeMarkup)}" preserveAspectRatio="xMidYMid meet" />`,
    );
  } else if (code) {
    content.push(
      `<rect x="${padding}" y="${barcodeY}" width="${barcodeWidth}" height="${barcodeHeight}" rx="10" class="emptyBarcode" />`,
    );
    content.push(svgText('바코드 표시 불가', width / 2, barcodeY + barcodeHeight / 2 + 4, 'emptyText', 'middle'));
  }

  if (code && options.showBarcodeValue) {
    content.push(svgText(code, width / 2, barcodeY + barcodeHeight + 22, 'code', 'middle'));
  }

  memoLines.forEach((line, index) => {
    content.push(svgText(line, padding, height - padding - (memoLines.length - index - 1) * 18, 'memo'));
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthMm}mm" height="${size.heightMm}mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="상품 라벨">
  <style>
    .title { font: 800 27px Arial, sans-serif; fill: #0f172a; }
    .price { font: 800 23px Arial, sans-serif; fill: #0369a1; }
    .meta { font: 600 15px Arial, sans-serif; fill: #334155; }
    .code { font: 700 18px Arial, sans-serif; letter-spacing: 1.5px; fill: #111827; }
    .memo { font: 600 14px Arial, sans-serif; fill: #475569; }
    .emptyBarcode { fill: #f8fafc; stroke: #cbd5e1; stroke-dasharray: 8 7; }
    .emptyText { font: 700 16px Arial, sans-serif; fill: #64748b; }
  </style>
  <rect width="100%" height="100%" rx="18" fill="#ffffff" />
  ${options.showBorder ? `<rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="16" fill="none" stroke="#cbd5e1" stroke-width="2" />` : ''}
  ${content.join('\n  ')}
</svg>`;
}

function svgToPngDataUrl(labelSvg: string, size: LabelSize) {
  return new Promise<string>((resolve, reject) => {
    const svgBlob = new Blob([labelSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size.widthMm * 8;
      canvas.height = size.heightMm * 8;
      const context = canvas.getContext('2d');

      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas context is not available.'));
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Label image rendering failed.'));
    };

    image.src = url;
  });
}

function getFieldValue(form: LabelForm, key: keyof LabelForm) {
  return form[key];
}

export function ProductLabelMaker() {
  const [form, setForm] = useState<LabelForm>(initialForm);
  const [sizeKey, setSizeKey] = useState<LabelSizeKey>('medium');
  const [options, setOptions] = useState<LabelOptions>(initialOptions);
  const [barcodeSvg, setBarcodeSvg] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const selectedSize = useMemo(
    () => labelSizes.find((size) => size.key === sizeKey) ?? labelSizes[1],
    [sizeKey],
  );

  const labelSvg = useMemo(
    () => buildLabelSvg(form, selectedSize, barcodeSvg, options),
    [barcodeSvg, form, options, selectedSize],
  );

  const updateField = (key: keyof LabelForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    const result = createBarcodeSvg(form.barcodeValue, barcodeHeightOptions[options.barcodeHeight].jsBarcodeHeight);
    setBarcodeSvg(result.markup);
    setBarcodeError(result.error);
  }, [form.barcodeValue, options.barcodeHeight]);

  const downloadSvg = () => {
    downloadBlob(labelSvg, getSafeFileName(form.productName, 'svg'), 'image/svg+xml;charset=utf-8');
  };

  const downloadPng = async () => {
    try {
      const pngUrl = await svgToPngDataUrl(labelSvg, selectedSize);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = getSafeFileName(form.productName, 'png');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setBarcodeError('PNG 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  const downloadPdf = async () => {
    try {
      const [{ PDFDocument }, pngUrl] = await Promise.all([
        import('pdf-lib'),
        svgToPngDataUrl(labelSvg, selectedSize),
      ]);
      const pngBytes = await fetch(pngUrl).then((response) => response.arrayBuffer());
      const pdfDocument = await PDFDocument.create();
      const widthPt = (selectedSize.widthMm / 25.4) * 72;
      const heightPt = (selectedSize.heightMm / 25.4) * 72;
      const page = pdfDocument.addPage([widthPt, heightPt]);
      const pngImage = await pdfDocument.embedPng(pngBytes);

      page.drawImage(pngImage, { x: 0, y: 0, width: widthPt, height: heightPt });

      const pdfBytes = await pdfDocument.save();
      const pdfArrayBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength,
      ) as ArrayBuffer;

      downloadBlob(pdfArrayBuffer, getSafeFileName(form.productName, 'pdf'), 'application/pdf');
    } catch {
      setBarcodeError('PDF 파일을 만들지 못했습니다. PNG 또는 SVG 다운로드를 이용해 주세요.');
    }
  };

  const loadExample = () => {
    const confirmed = window.confirm('현재 입력한 내용이 예시값으로 바뀝니다. 예시를 다시 불러올까요?');
    if (!confirmed) return;

    setForm(initialForm);
    setOptions(initialOptions);
  };

  const fields: { key: keyof LabelForm; label: string; placeholder?: string; rows?: number }[] = [
    { key: 'productName', label: '상품명', placeholder: '참치회 세트' },
    { key: 'option', label: '옵션/규격', placeholder: '300g / 냉장' },
    { key: 'barcodeValue', label: '바코드 번호 또는 상품코드', placeholder: '8801234567890' },
    { key: 'sku', label: 'SKU/내부관리코드', placeholder: 'TUNA-A001' },
    { key: 'price', label: '가격', placeholder: '29,900원' },
    { key: 'origin', label: '원산지', placeholder: '국내산' },
    { key: 'manufactureDate', label: '제조일자', placeholder: '2026-06-30' },
    { key: 'expirationDate', label: '유통기한', placeholder: '2026-07-03' },
    { key: 'storage', label: '보관방법', placeholder: '냉장보관' },
    { key: 'brand', label: '업체명/브랜드명', placeholder: '엑클로드' },
    { key: 'memo', label: '메모', placeholder: '당일 발송 상품', rows: 3 },
  ];

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <Barcode className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">상품 정보 입력</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              이미 가지고 있는 바코드 번호나 내부 상품코드와 상품 정보를 입력하면 라벨 미리보기가 바로
              바뀝니다.
            </p>
            <p className="mt-2 text-xs font-semibold text-zinc-500">
              입력하지 않은 항목은 라벨에서 자동으로 숨겨집니다.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          <div className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-bold">이 도구는 바코드 번호를 새로 발급하지 않습니다.</span>
              <br />
              이미 가지고 있는 바코드 번호나 내부 상품코드를 라벨 이미지로 정리하는 도구입니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-bold text-zinc-950">라벨 크기</span>
            <select
              value={sizeKey}
              onChange={(event) => setSizeKey(event.target.value as LabelSizeKey)}
              className={inputClassName}
            >
              {labelSizes.map((size) => (
                <option key={size.key} value={size.key}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">바코드 형식</p>
            <p className="mt-2 text-sm text-zinc-700">CODE128</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              숫자, 영문, 일부 기호를 그대로 표현합니다. 체크디지트를 자동으로 만들거나 입력값을 수정하지
              않습니다.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">표시 옵션</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">바코드 번호 표시</span>
                <select
                  value={options.showBarcodeValue ? 'on' : 'off'}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, showBarcodeValue: event.target.value === 'on' }))
                  }
                  className={inputClassName}
                >
                  <option value="on">켜기</option>
                  <option value="off">끄기</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">바코드 높이</span>
                <select
                  value={options.barcodeHeight}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, barcodeHeight: event.target.value as BarcodeHeightKey }))
                  }
                  className={inputClassName}
                >
                  {Object.entries(barcodeHeightOptions).map(([key, option]) => (
                    <option key={key} value={key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">라벨 테두리 표시</span>
                <select
                  value={options.showBorder ? 'on' : 'off'}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, showBorder: event.target.value === 'on' }))
                  }
                  className={inputClassName}
                >
                  <option value="on">켜기</option>
                  <option value="off">끄기</option>
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field.key} className={field.rows ? 'block sm:col-span-2' : 'block'}>
                <span className="text-sm font-bold text-zinc-950">{field.label}</span>
                {field.rows ? (
                  <textarea
                    value={getFieldValue(form, field.key)}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    rows={field.rows}
                    placeholder={field.placeholder}
                    className={inputClassName}
                  />
                ) : (
                  <input
                    value={getFieldValue(form, field.key)}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className={inputClassName}
                  />
                )}
              </label>
            ))}
          </div>

          {barcodeError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {barcodeError}
            </div>
          )}

          <button
            type="button"
            onClick={loadExample}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-fit"
          >
            <RotateCcw className="size-4" aria-hidden />
            예시 다시 불러오기
          </button>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                입력한 상품 정보와 바코드 번호는 서버에 저장하지 않습니다. 사용자의 브라우저에서만 라벨
                이미지로 변환됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">라벨 미리보기</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          비어 있는 항목은 라벨에서 자동으로 숨깁니다. 다운로드되는 SVG는 mm 크기 정보를 포함합니다.
        </p>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100 p-4">
          <div
            className={`mx-auto w-full rounded-[18px] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] ${
              options.showBorder ? 'ring-1 ring-slate-200' : ''
            }`}
            style={{
              maxWidth: selectedSize.previewWidth,
              aspectRatio: `${selectedSize.widthMm} / ${selectedSize.heightMm}`,
            }}
          >
            <div className="flex h-full flex-col p-[6%]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {form.productName.trim() && (
                    <h4 className="line-clamp-2 text-lg font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-xl">
                      {form.productName}
                    </h4>
                  )}
                  {form.option.trim() && <p className="mt-1 text-xs font-bold text-slate-600">{form.option}</p>}
                </div>
                {form.price.trim() && (
                  <p className="shrink-0 text-right text-base font-black text-sky-700 sm:text-lg">{form.price}</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-700">
                {[
                  ['원산지', form.origin],
                  ['보관', form.storage],
                  ['제조', form.manufactureDate],
                  ['유통', form.expirationDate],
                  ['SKU', form.sku],
                  ['업체', form.brand],
                ]
                  .filter(([, value]) => value.trim())
                  .map(([label, value]) => (
                    <p key={label} className="min-w-0 truncate">
                      <span className="text-slate-500">{label}</span> {value}
                    </p>
                  ))}
              </div>

              <div className="mt-auto pt-3">
                {(barcodeSvg || form.barcodeValue.trim()) && (
                  <div
                    className={`flex ${barcodeHeightOptions[options.barcodeHeight].previewClassName} items-center justify-center overflow-hidden rounded-lg bg-white`}
                  >
                    {barcodeSvg ? (
                      <div className="w-full" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                    ) : (
                      <span className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500">
                        바코드 표시 불가
                      </span>
                    )}
                  </div>
                )}
                {form.barcodeValue.trim() && options.showBarcodeValue && (
                  <p className="mt-1 truncate text-center text-xs font-black tracking-[0.12em] text-slate-900">
                    {form.barcodeValue}
                  </p>
                )}
                {form.memo.trim() && <p className="mt-1 truncate text-xs font-semibold text-slate-500">{form.memo}</p>}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          출력 후 실제 바코드 스캐너 또는 휴대폰 앱으로 인식 여부를 확인해 주세요. 바코드 주변 여백이 너무
          좁거나 인쇄가 흐리면 스캔이 어려울 수 있습니다.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void downloadPng()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Download className="size-4" aria-hidden />
            PNG 다운로드
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Download className="size-4" aria-hidden />
            SVG 다운로드
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-100"
          >
            <Download className="size-4" aria-hidden />
            인쇄용 PDF 다운로드
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs leading-relaxed">
          <p className="rounded-xl bg-blue-50 p-3 text-blue-900">
            쿠팡, 스마트스토어, 대형마트 등에 등록하는 공식 상품 바코드는 GS1 등 공식 기관에서 발급받은
            번호를 사용해야 할 수 있습니다.
          </p>
          <p className="rounded-xl bg-zinc-50 p-3 text-zinc-600">
            다운로드 후 실제 라벨 프린터나 인쇄 설정에서 크기와 스캔 인식 여부를 한 번 확인해 주세요.
          </p>
        </div>
      </section>
    </div>
  );
}
