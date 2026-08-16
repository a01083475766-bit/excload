'use client';

import { useState } from 'react';
import { Check, Copy, Download, Monitor } from 'lucide-react';
import {
  OEG_RECORDER_RELEASE,
  formatOegRecorderSizeMb,
} from '@/app/free-tools/oeg-recorder-release';

const steps = [
  {
    text: '다운로드한 ZIP 파일을 마우스 오른쪽 버튼으로 누른 뒤 ‘모두 압축 풀기’ 또는 압축 프로그램의 ‘압축 풀기’를 선택합니다.',
  },
  {
    text: '압축을 푼 폴더에서 파란색 OEG 아이콘의 ‘00_OEG녹화_실행’을 두 번 클릭합니다.',
    hint: '실행 바로가기가 보이지 않으면 OEGRecorder.exe를 직접 실행해도 됩니다.',
  },
  {
    text: '처음 실행할 때 한 번만 이용약관 확인 화면이 표시됩니다. 내용을 확인하고 동의하면 프로그램이 시작됩니다.',
  },
  {
    text: '녹화 영역·화질·FPS·소리를 선택한 다음 녹화를 시작합니다.',
  },
];

const shortcuts = [
  { key: 'F8', label: '녹화 시작·정지' },
  { key: 'F9', label: '일시정지·계속' },
  { key: '영역 중앙의 + 드래그', label: '녹화 영역 이동' },
  { key: '선택 영역 안에서 마우스 휠', label: '영역 확대·축소(영역 테두리가 보일 때)' },
];

const verifySteps = [
  '엑클로드 공식 무료도구 페이지에서 다운로드',
  '파일명과 SHA-256 값 확인',
  '값이 일치하면 ‘추가 정보 → 실행’ 선택',
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
                필요한 녹화 기능을 간편하게 사용할 수 있도록 만든 프로그램입니다. Windows 10·11 x64 PC에서
                무료로 사용할 수 있습니다.
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
        <ol className="mt-3 space-y-3">
          {steps.map((step, index) => (
            <li key={step.text} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p>{step.text}</p>
                {'hint' in step && step.hint ? (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.hint}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <h4 className="mt-5 text-xs font-semibold text-zinc-800">기본 조작</h4>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {shortcuts.map((item) => (
            <div
              key={item.key}
              className="flex flex-col gap-0.5 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
            >
              <span className="text-sm font-medium text-zinc-800">{item.key}</span>
              <span className="text-xs text-zinc-600">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-blue-200 border-l-4 border-l-blue-600 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-bold text-zinc-950">엑클로드가 직접 제작·배포합니다</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          OEG 녹화는 엑클로드 운영사에서 직접 제작하고 공식 무료도구 페이지를 통해 배포하는 프로그램입니다.
          추가 프로그램·툴바·자동 광고창이 포함되어 있지 않으며, 녹화한 영상과 소리는 외부 서버로 전송되지 않고
          사용자의 PC에 저장됩니다.
        </p>

        <h4 className="mt-4 text-xs font-semibold text-zinc-800">
          Windows에서 ‘알 수 없는 게시자’가 표시되나요?
        </h4>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          현재 베타 버전에는 Windows 코드 서명 인증서가 적용되지 않아 처음 실행할 때 ‘알 수 없는 게시자’ 또는
          ‘Windows의 PC 보호’ 안내가 표시될 수 있습니다. 이 안내가 표시되는 것만으로 악성 프로그램으로
          판정되었다는 의미는 아닙니다.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          엑클로드 공식 페이지에서 다운로드한 파일인지 확인하고, 아래의 파일명과 SHA-256 값이 일치할 때만
          ‘추가 정보 → 실행’을 선택해 주세요. 다른 사이트나 출처를 알 수 없는 곳에서 받은 파일은 실행하지
          마세요.
        </p>

        <ol className="mt-3 space-y-1.5">
          {verifySteps.map((text, index) => (
            <li key={text} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-bold text-zinc-950">공식 파일 확인</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          아래 SHA-256 값이 이 페이지에 표시된 값과 같으면 엑클로드에서 배포한 공식 파일인지 확인할 수
          있습니다.
        </p>
        <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-800">SHA-256</p>
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
          <p className="mt-2 text-xs text-zinc-500">파일명 {OEG_RECORDER_RELEASE.fileName}</p>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 sm:p-5">
        <h3 className="text-sm font-bold text-zinc-950">이용 조건</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          OEG 녹화는 개인과 사업자가 무료로 사용할 수 있습니다. 다만 프로그램의 수정·재배포·판매·사칭은
          허용되지 않습니다. 다른 사람에게 소개할 때는 프로그램 파일을 직접 전달하거나 다시 올리지 말고
          엑클로드 공식 다운로드 페이지 주소를 공유해 주세요.
        </p>
      </section>
    </div>
  );
}
