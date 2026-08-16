'use client';

import { useState } from 'react';
import { Check, Copy, Download, Monitor } from 'lucide-react';
import {
  OEG_RECORDER_RELEASE,
  formatOegRecorderSizeMb,
} from '@/app/free-tools/oeg-recorder-release';

const steps = [
  'ZIP을 원하는 폴더에 압축 해제합니다. (폴더 하나 안에 파일이 모입니다)',
  'OEGRecorder.exe를 실행합니다.',
  '처음 실행 시 이용약관을 읽고 동의한 뒤 사용합니다.',
  '녹화 영역·해상도·FPS·소리를 설정한 다음 녹화를 시작합니다.',
];

const shortcuts = [
  { key: 'F8', label: '녹화 시작 / 정지' },
  { key: 'F9', label: '일시정지 / 계속' },
  { key: '중앙 드래그', label: '촬영 위치 이동' },
  { key: '중앙 + 휠', label: '확대 / 축소' },
];

const notices = [
  '추가 프로그램·자동 광고창이 없습니다.',
  '녹화 영상은 사용자 PC에만 저장됩니다. (기본: Windows 동영상\\OEG 녹화)',
  '무료로 사용할 수 있으나, 수정·재배포·판매·사칭은 금지됩니다.',
  'Windows SmartScreen이 뜨면 「추가 정보」→「실행」을 선택하세요. (서명 전 베타에서 흔히 보입니다)',
];

export function OegRecorderDownload() {
  const [copied, setCopied] = useState(false);
  const sha = OEG_RECORDER_RELEASE.sha256;

  async function copySha() {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <span className="h-fit rounded-md border border-zinc-200 bg-zinc-50 p-2 text-blue-600">
              <Monitor className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold text-blue-700">PC 무료 프로그램</p>
              <h3 className="mt-1 text-base font-bold text-zinc-950">OEG 녹화 다운로드</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                원하는 화면 영역과 컴퓨터 소리·마이크를 MP4로 녹화하는 Windows용 무료 프로그램입니다.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs font-medium text-zinc-600">
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
              {OEG_RECORDER_RELEASE.versionLabel}
            </span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
              {OEG_RECORDER_RELEASE.platformLabel}
            </span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
              무설치 ZIP · {OEG_RECORDER_RELEASE.sizeLabel}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <a
            href={OEG_RECORDER_RELEASE.downloadUrl}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Download className="size-4" aria-hidden />
            OEG 녹화 다운로드 (.ZIP)
          </a>
          <p className="text-xs text-zinc-500">
            파일명 {OEG_RECORDER_RELEASE.fileName} · 약 {formatOegRecorderSizeMb()}
          </p>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-bold text-zinc-950">사용 방법</h3>
        <ol className="mt-3 space-y-2">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <h4 className="mt-5 text-xs font-semibold text-zinc-800">기본 조작</h4>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {shortcuts.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm"
            >
              <span className="font-medium text-zinc-800">{item.key}</span>
              <span className="text-xs text-zinc-600">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-bold text-zinc-950">안내 · 주의</h3>
        <ul className="mt-3 space-y-2">
          {notices.map((text) => (
            <li key={text} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-800">SHA-256 (무결성 확인용)</p>
            <button
              type="button"
              onClick={copySha}
              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-zinc-600">{sha}</p>
        </div>
      </section>
    </div>
  );
}
