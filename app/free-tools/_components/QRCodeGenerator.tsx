'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Download, QrCode, RotateCcw } from 'lucide-react';
import QRCode from 'qrcode';
import type { QRCodeErrorCorrectionLevel, QRCodeToDataURLOptions, QRCodeToStringOptions } from 'qrcode';

type QRType = 'url' | 'text' | 'phone' | 'sms' | 'email' | 'wifi';
type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
type ResultState = 'empty' | 'done' | 'stale';

type GeneratedQR = {
  data: string;
  pngUrl: string;
  svg: string;
  typeLabel: string;
  summary: { label: string; value: string }[];
};

type QRBuildResult =
  | { error: string }
  | {
      data: string;
      typeLabel: string;
      summary: { label: string; value: string }[];
    };

const qrTypes: { value: QRType; label: string }[] = [
  { value: 'text', label: '직접 입력' },
  { value: 'url', label: '웹사이트 주소' },
  { value: 'phone', label: '전화번호' },
  { value: 'sms', label: '문자 보내기' },
  { value: 'email', label: '이메일 보내기' },
  { value: 'wifi', label: '와이파이 연결' },
];

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

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeWifi(value: string) {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

function getHexWithAlpha(hex: string) {
  return `${hex.replace('#', '#')}ff`;
}

function getColorDistance(a: string, b: string) {
  const parse = (hex: string) => {
    const normalized = hex.replace('#', '');
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      bl: parseInt(normalized.slice(4, 6), 16),
    };
  };
  const first = parse(a);
  const second = parse(b);
  return Math.sqrt(
    (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.bl - second.bl) ** 2,
  );
}

export function QRCodeGenerator() {
  const [qrType, setQrType] = useState<QRType>('text');
  const [url, setUrl] = useState('https://');
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiSecurity, setWifiSecurity] = useState<WifiSecurity>('WPA');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiHidden, setWifiHidden] = useState(false);
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [size, setSize] = useState(512);
  const [darkColor, setDarkColor] = useState('#000000');
  const [lightColor, setLightColor] = useState('#ffffff');
  const [margin, setMargin] = useState(4);
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState<QRCodeErrorCorrectionLevel>('M');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedQR | null>(null);
  const [resultState, setResultState] = useState<ResultState>('empty');
  const [generating, setGenerating] = useState(false);

  const colorWarning = useMemo(
    () => getColorDistance(darkColor, lightColor) < 120,
    [darkColor, lightColor],
  );

  const markStale = () => {
    setError(null);
    if (result) setResultState('stale');
  };

  const resetAll = () => {
    setQrType('text');
    setUrl('https://');
    setText('');
    setPhone('');
    setSmsPhone('');
    setSmsMessage('');
    setEmailTo('');
    setEmailSubject('');
    setEmailBody('');
    setWifiSsid('');
    setWifiSecurity('WPA');
    setWifiPassword('');
    setWifiHidden(false);
    setShowWifiPassword(false);
    setSize(512);
    setDarkColor('#000000');
    setLightColor('#ffffff');
    setMargin(4);
    setErrorCorrectionLevel('M');
    setAdvancedOpen(false);
    setError(null);
    setResult(null);
    setResultState('empty');
  };

  const buildQRData = (): QRBuildResult => {
    if (qrType === 'url') {
      const normalized = normalizeUrl(url);
      if (!normalized) return { error: '웹사이트 주소를 입력해 주세요.' };
      if (!isValidUrl(normalized)) return { error: '올바른 웹사이트 주소를 입력해 주세요.' };
      return {
        data: normalized,
        typeLabel: '웹사이트 주소',
        summary: [{ label: '연결 주소', value: normalized }],
      };
    }

    if (qrType === 'text') {
      const trimmed = text.trim();
      if (!trimmed) return { error: 'QR코드에 담을 문구를 입력해 주세요.' };
      return {
        data: trimmed.slice(0, 2000),
        typeLabel: '직접 입력',
        summary: [{ label: '문구', value: trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed }],
      };
    }

    if (qrType === 'phone') {
      const normalized = normalizePhone(phone);
      if (!normalized) return { error: '전화번호를 입력해 주세요.' };
      return {
        data: `tel:${normalized}`,
        typeLabel: '전화번호',
        summary: [{ label: '전화번호', value: phone.trim() }],
      };
    }

    if (qrType === 'sms') {
      const normalized = normalizePhone(smsPhone);
      if (!normalized) return { error: '받는 사람 전화번호를 입력해 주세요.' };
      const query = smsMessage.trim() ? `?body=${encodeURIComponent(smsMessage.trim())}` : '';
      return {
        data: `sms:${normalized}${query}`,
        typeLabel: '문자 보내기',
        summary: [
          { label: '받는 사람', value: smsPhone.trim() },
          { label: '문자 내용', value: smsMessage.trim() ? '입력됨' : '없음' },
        ],
      };
    }

    if (qrType === 'email') {
      const to = emailTo.trim();
      if (!to) return { error: '받는 사람 이메일 주소를 입력해 주세요.' };
      if (!isValidEmail(to)) return { error: '올바른 이메일 주소를 입력해 주세요.' };
      const params = new URLSearchParams();
      if (emailSubject.trim()) params.set('subject', emailSubject.trim());
      if (emailBody.trim()) params.set('body', emailBody.trim());
      const query = params.toString();
      return {
        data: `mailto:${to}${query ? `?${query}` : ''}`,
        typeLabel: '이메일 보내기',
        summary: [
          { label: '받는 사람', value: to },
          { label: '제목', value: emailSubject.trim() ? '입력됨' : '없음' },
          { label: '내용', value: emailBody.trim() ? '입력됨' : '없음' },
        ],
      };
    }

    const ssid = wifiSsid.trim();
    if (!ssid) return { error: '와이파이 이름(SSID)을 입력해 주세요.' };
    const security = wifiSecurity === 'nopass' ? 'nopass' : wifiSecurity;
    const passwordPart = wifiSecurity === 'nopass' ? '' : `P:${escapeWifi(wifiPassword)};`;
    return {
      data: `WIFI:T:${security};S:${escapeWifi(ssid)};${passwordPart}H:${wifiHidden ? 'true' : 'false'};`,
      typeLabel: '와이파이 연결',
      summary: [
        { label: '와이파이 이름', value: ssid },
        { label: '보안 방식', value: wifiSecurity === 'WPA' ? 'WPA/WPA2' : wifiSecurity === 'WEP' ? 'WEP' : '비밀번호 없음' },
        { label: '비밀번호', value: wifiSecurity === 'nopass' ? '없음' : wifiPassword ? '입력됨' : '비어 있음' },
      ],
    };
  };

  const generateQR = async () => {
    const built = buildQRData();
    if ('error' in built) {
      setError(built.error);
      return;
    }

    setGenerating(true);
    try {
      const baseOptions = {
        width: size,
        margin,
        errorCorrectionLevel,
        color: {
          dark: getHexWithAlpha(darkColor),
          light: getHexWithAlpha(lightColor),
        },
      };
      const pngUrl = await QRCode.toDataURL(built.data, {
        ...baseOptions,
        type: 'image/png',
      } satisfies QRCodeToDataURLOptions);
      const svg = await QRCode.toString(built.data, {
        ...baseOptions,
        type: 'svg',
      } satisfies QRCodeToStringOptions);

      setResult({
        data: built.data,
        pngUrl,
        svg,
        typeLabel: built.typeLabel,
        summary: built.summary,
      });
      setResultState('done');
      setError(null);
    } catch {
      setError('QR코드를 생성하지 못했습니다. 입력값이나 설정을 확인해 주세요.');
    } finally {
      setGenerating(false);
    }
  };

  const inputClassName = 'mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm';

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2 xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <QrCode className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">QR코드 내용과 설정</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              링크, 문구, 전화번호, 이메일, 와이파이 정보를 QR코드로 만들 수 있습니다. 입력한 내용은
              서버로 전송되지 않고 사용자의 브라우저에서만 처리됩니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <label className="block">
            <span className="text-sm font-bold text-zinc-950">QR코드 종류</span>
            <select
              value={qrType}
              onChange={(event) => {
                setQrType(event.target.value as QRType);
                markStale();
              }}
              className={inputClassName}
            >
              {qrTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          {qrType === 'url' && (
            <label className="block">
              <span className="text-sm font-bold text-zinc-950">웹사이트 주소</span>
              <input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  markStale();
                }}
                placeholder="https://"
                className={inputClassName}
              />
              <span className="mt-2 block text-xs text-zinc-500">
                QR코드를 스캔했을 때 열릴 웹사이트 주소를 입력해 주세요.
              </span>
            </label>
          )}

          {qrType === 'text' && (
            <label className="block">
              <span className="text-sm font-bold text-zinc-950">문구 입력</span>
              <textarea
                value={text}
                maxLength={2000}
                onChange={(event) => {
                  setText(event.target.value);
                  markStale();
                }}
                rows={7}
                className={inputClassName}
              />
              <span className="mt-2 flex justify-between gap-3 text-xs text-zinc-500">
                <span>안내문, 계좌 정보, 주문 안내 등 QR코드에 담을 문구를 입력해 주세요.</span>
                <span>{text.length.toLocaleString('ko-KR')} / 2,000자</span>
              </span>
            </label>
          )}

          {qrType === 'phone' && (
            <label className="block">
              <span className="text-sm font-bold text-zinc-950">전화번호</span>
              <input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  markStale();
                }}
                placeholder="010-1234-5678"
                className={inputClassName}
              />
            </label>
          )}

          {qrType === 'sms' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">받는 사람 전화번호</span>
                <input
                  value={smsPhone}
                  onChange={(event) => {
                    setSmsPhone(event.target.value);
                    markStale();
                  }}
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">문자 내용</span>
                <textarea
                  value={smsMessage}
                  onChange={(event) => {
                    setSmsMessage(event.target.value);
                    markStale();
                  }}
                  rows={4}
                  className={inputClassName}
                />
              </label>
            </div>
          )}

          {qrType === 'email' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">받는 사람 이메일</span>
                <input
                  value={emailTo}
                  onChange={(event) => {
                    setEmailTo(event.target.value);
                    markStale();
                  }}
                  placeholder="seller@example.com"
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">제목</span>
                <input
                  value={emailSubject}
                  onChange={(event) => {
                    setEmailSubject(event.target.value);
                    markStale();
                  }}
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">내용</span>
                <textarea
                  value={emailBody}
                  onChange={(event) => {
                    setEmailBody(event.target.value);
                    markStale();
                  }}
                  rows={4}
                  className={inputClassName}
                />
              </label>
            </div>
          )}

          {qrType === 'wifi' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">와이파이 이름(SSID)</span>
                <input
                  value={wifiSsid}
                  onChange={(event) => {
                    setWifiSsid(event.target.value);
                    markStale();
                  }}
                  className={inputClassName}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-zinc-950">보안 방식</span>
                <select
                  value={wifiSecurity}
                  onChange={(event) => {
                    setWifiSecurity(event.target.value as WifiSecurity);
                    markStale();
                  }}
                  className={inputClassName}
                >
                  <option value="WPA">WPA/WPA2</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">비밀번호 없음</option>
                </select>
              </label>
              {wifiSecurity !== 'nopass' && (
                <label className="block">
                  <span className="text-sm font-bold text-zinc-950">비밀번호</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={wifiPassword}
                      type={showWifiPassword ? 'text' : 'password'}
                      onChange={(event) => {
                        setWifiPassword(event.target.value);
                        markStale();
                      }}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPassword((prev) => !prev)}
                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      {showWifiPassword ? '숨기기' : '보기'}
                    </button>
                  </div>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={wifiHidden}
                  onChange={(event) => {
                    setWifiHidden(event.target.checked);
                    markStale();
                  }}
                />
                숨겨진 네트워크
              </label>
              <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                QR코드를 스캔하면 와이파이 연결 정보를 확인할 수 있습니다. 와이파이 이름과 비밀번호는
                서버에 저장되거나 전송되지 않습니다.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-bold text-zinc-950">기본 설정</p>
            <label className="mt-3 block">
              <span className="text-xs font-medium text-zinc-600">QR코드 크기</span>
              <select
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value));
                  markStale();
                }}
                className={inputClassName}
              >
                <option value={256}>256 × 256</option>
                <option value={512}>512 × 512</option>
                <option value={1024}>1024 × 1024</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              {advancedOpen ? '고급 설정 접기' : '고급 설정 펼치기'}
            </button>

            {advancedOpen && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">QR코드 색상</span>
                  <input
                    type="color"
                    value={darkColor}
                    onChange={(event) => {
                      setDarkColor(event.target.value);
                      markStale();
                    }}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white p-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">배경 색상</span>
                  <input
                    type="color"
                    value={lightColor}
                    onChange={(event) => {
                      setLightColor(event.target.value);
                      markStale();
                    }}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white p-1"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">바깥 여백</span>
                  <input
                    value={margin}
                    onChange={(event) => {
                      setMargin(Math.max(0, Math.min(10, Number(event.target.value.replace(/\D/g, '')) || 0)));
                      markStale();
                    }}
                    className={inputClassName}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">오류 복원 수준</span>
                  <select
                    value={errorCorrectionLevel}
                    onChange={(event) => {
                      setErrorCorrectionLevel(event.target.value as QRCodeErrorCorrectionLevel);
                      markStale();
                    }}
                    className={inputClassName}
                  >
                    <option value="L">L</option>
                    <option value="M">M</option>
                    <option value="Q">Q</option>
                    <option value="H">H</option>
                  </select>
                </label>
                <p className="sm:col-span-2 text-xs leading-relaxed text-zinc-500">
                  오류 복원 수준이 높을수록 일부가 가려져도 인식될 가능성이 높지만 QR코드가 더 복잡해질
                  수 있습니다.
                </p>
                {colorWarning && (
                  <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                    QR코드와 배경 색상의 차이가 작으면 카메라가 인식하지 못할 수 있습니다. 검정색
                    QR코드와 흰색 배경 사용을 권장합니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void generateQR()}
              disabled={generating}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
            >
              {generating ? '생성 중...' : 'QR코드 만들기'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              설정 초기화
            </button>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-xs leading-relaxed text-blue-900">
            입력한 주소, 문구, 연락처, 이메일 및 와이파이 정보는 서버로 전송되지 않습니다. QR코드는
            사용자의 브라우저에서만 생성됩니다. 페이지를 닫거나 새로고침하면 입력한 내용과 생성 결과는
            사라집니다.
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">QR코드 결과 미리보기</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          생성한 QR코드는 PNG 또는 SVG 파일로 받을 수 있습니다. 보통은 PNG를 받으면 되고, 크게 인쇄하거나
          디자인 작업에 넣을 때는 SVG가 더 선명합니다.
        </p>

        {!result ? (
          <div className="mt-5 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center text-sm leading-relaxed text-zinc-500">
            내용을 입력하고 QR코드 만들기를 누르면 결과가 여기에 표시됩니다.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div
              className={`rounded-xl border p-4 text-center ${
                resultState === 'stale' ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50'
              }`}
            >
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  resultState === 'stale'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {resultState === 'stale' ? '다시 만들기 필요' : '생성 완료'}
              </span>
              {resultState === 'stale' && (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  입력 내용이 변경되었습니다. QR코드를 다시 만들어 주세요.
                </p>
              )}
              <img
                src={result.pngUrl}
                alt={`${result.typeLabel} QR코드`}
                className={`mx-auto mt-4 h-auto max-w-full rounded-lg bg-white p-4 ${
                  resultState === 'stale' ? 'opacity-40' : ''
                }`}
                style={{ width: Math.min(size, 360) }}
              />
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-bold text-zinc-950">결과 요약</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 font-semibold text-zinc-600">종류:</dt>
                  <dd className="min-w-0 break-words text-zinc-900">{result.typeLabel}</dd>
                </div>
                {result.summary.map((item) => (
                  <div key={item.label} className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-zinc-600">{item.label}:</dt>
                    <dd className="min-w-0 break-words text-zinc-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={resultState !== 'done'}
                onClick={() => downloadDataUrl(result.pngUrl, 'excload-qr-code.png')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-zinc-200 disabled:text-zinc-500"
              >
                <Download className="size-4" aria-hidden />
                PNG 다운로드
              </button>
              <button
                type="button"
                disabled={resultState !== 'done'}
                onClick={() => downloadBlob(result.svg, 'excload-qr-code.svg', 'image/svg+xml;charset=utf-8')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:border-zinc-200 disabled:text-zinc-400"
              >
                <Download className="size-4" aria-hidden />
                SVG 다운로드
              </button>
            </div>

            <div className="grid gap-2 text-xs leading-relaxed sm:grid-cols-2">
              <p className="rounded-xl bg-blue-50 p-3 text-blue-900">
                <span className="font-bold">PNG</span>: 사진 파일처럼 바로 쓰기 쉽습니다. 카톡, 블로그,
                상세페이지에 올릴 때 추천합니다.
              </p>
              <p className="rounded-xl bg-zinc-50 p-3 text-zinc-600">
                <span className="font-bold text-zinc-800">SVG</span>: 크게 확대해도 선명한 파일입니다. 인쇄물,
                디자인 편집용으로 좋습니다.
              </p>
            </div>

            <p className="rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
              다운로드하기 전에 휴대전화 카메라로 QR코드가 정상적으로 인식되는지 확인해 보세요.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
