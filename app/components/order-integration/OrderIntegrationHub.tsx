'use client';

import { useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import {
  Truck,
  Search,
  ArrowDown,
  Link2,
  Upload,
  CalendarDays,
  Coins,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';

/**
 * 쇼핑몰주문연동 허브 — 택배주문변환과 동일 레이아웃 골격.
 * 페이지 특성: 타이틀 오른쪽 「쇼핑몰 연동 설정」, 좌측 「주문조회 하기」, 안내 문구.
 */
export default function OrderIntegrationHub() {
  const user = useUserStore((state) => state.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textOrder, setTextOrder] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [hubNotice, setHubNotice] = useState<string | null>(null);

  const showSkeletonNotice = (message: string) => {
    setHubNotice(message);
  };

  const onFilesChosen = (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png') ||
        name.endsWith('.gif')
      );
    });
    if (list.length === 0) {
      showSkeletonNotice('엑셀(.xlsx/.xls) 또는 이미지 파일만 선택할 수 있습니다.');
      return;
    }
    setSelectedFiles((prev) => [...prev, ...list]);
    setHubNotice(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) {
      onFilesChosen(event.dataTransfer.files);
    }
  };

  return (
    <div className="bg-zinc-50 pb-4 pt-1.5 dark:bg-black">
      <main className="mx-auto max-w-[1200px] px-3 sm:px-5 lg:px-8">
        <section className="relative pb-3 pt-1">
          {/* 타이틀 줄: 가운데 제목 + 오른쪽 페이지 특성 버튼(사용량과 동일 200×38) */}
          <div className="relative mb-2 flex min-h-[38px] w-full items-center justify-center">
            <h1 className="px-2 text-center text-lg font-semibold text-gray-900 sm:px-[212px] sm:text-xl dark:text-zinc-100">
              쇼핑몰주문연동
            </h1>
            <div className="mt-2 flex w-full justify-center sm:absolute sm:right-0 sm:top-1/2 sm:mt-0 sm:w-[200px] sm:-translate-y-1/2 sm:justify-end">
              <Link
                href="/order/integration/connect"
                className="flex h-[38px] w-full max-w-[200px] items-center justify-center gap-1.5 rounded-lg border-2 border-blue-600 bg-white px-3 text-sm font-semibold text-blue-700 shadow-md transition hover:bg-blue-50 dark:border-blue-400 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-zinc-800"
                title="쇼핑몰 API 키 등록·테스트"
              >
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                쇼핑몰 연동 설정
              </Link>
            </div>
          </div>

          <p className="mb-3 px-2 text-center text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            API로 연동된 쇼핑몰은 주문조회로, 아직 연동되지 않은 쇼핑몰은 엑셀·텍스트로
            같은 미리보기에 담아 택배 업로드 양식으로 정리합니다.
          </p>

          <div className="flex flex-col gap-2 lg:gap-3">
            {/* 택배변환과 동일: 좌 200px 액션 · 우 200px 사용량 */}
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div className="flex w-full shrink-0 flex-col justify-center gap-2 sm:h-[38px] sm:w-auto sm:flex-row sm:items-center sm:justify-start">
                <Link
                  href="/order/integration/fetch"
                  className="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white shadow-md transition hover:bg-green-700 sm:w-[200px]"
                >
                  <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
                  주문조회 하기
                </Link>
              </div>
              <div className="flex w-full shrink-0 justify-center sm:h-[38px] sm:w-[200px] sm:justify-end">
                {user ? (
                  <div className="flex h-[38px] w-full min-w-0 items-center justify-end gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-sky-600 px-3 text-white shadow-md sm:w-[200px]">
                    <Coins className="h-4 w-4 shrink-0" />
                    <span className="shrink-0 text-sm font-medium">잔여 사용량</span>
                    <span
                      className="min-w-0 truncate text-sm font-bold tabular-nums"
                      title={String(user.points)}
                    >
                      :{user.points.toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {hubNotice ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                role="status"
              >
                {hubNotice}
              </div>
            ) : null}

            {/* 통합 입력 카드 — 택배변환과 동일 골격 */}
            <div className="w-full rounded-xl border-2 border-blue-500 bg-white p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                <div className="flex w-full flex-col lg:w-1/2">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">파일선택</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      미연동 쇼핑몰 주문엑셀·이미지를 선택하거나 이 영역에 끌어다 놓아 주세요
                    </p>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={`flex h-[180px] w-full cursor-pointer flex-col overflow-hidden rounded-lg border-2 border-dashed bg-gray-50 p-4 transition-colors ${
                      dragOver
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-gray-700">엑셀파일 · 이미지파일</p>
                        <p className="text-xs text-gray-500">클릭하거나 드래그하여 업로드하세요</p>
                        <p className="mt-1.5 text-xs text-gray-400">(xlsx, xls, jpg, png, gif)</p>
                      </div>
                      {selectedFiles.length > 0 ? (
                        <p className="mt-2 text-sm text-gray-600">
                          📄 선택된 파일: {selectedFiles[0]?.name}
                          {selectedFiles.length > 1 ? ` 외 ${selectedFiles.length - 1}개` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) onFilesChosen(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={selectedFiles.length === 0}
                    onClick={() =>
                      showSkeletonNotice(
                        '선택한 파일은 다음 단계에서 미리보기 모델·변환 엔진에 연결됩니다.',
                      )
                    }
                    className="mt-2.5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    파일 주문 변환
                  </button>
                </div>

                <div className="flex min-h-0 w-full flex-col border-l-0 border-gray-200 pl-0 lg:w-1/2 lg:border-l lg:pl-5">
                  <div className="mb-2.5 flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="shrink-0 text-base font-semibold text-gray-900">텍스트 주문입력</h3>
                    <p className="min-w-0 text-xs leading-relaxed text-gray-600">
                      카카오톡·문자·주문페이지 등에서 받은 주문내용을 붙여넣어주세요
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                    <textarea
                      value={textOrder}
                      onChange={(event) => setTextOrder(event.target.value)}
                      placeholder={
                        '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
                        '서울시 강남구 테헤란로 123  문앞에 놓아주세요'
                      }
                      className="min-h-[180px] w-full flex-1 basis-0 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!textOrder.trim()}
                      onClick={() =>
                        showSkeletonNotice(
                          '텍스트 주문은 다음 단계에서 미리보기 모델·변환 엔진에 연결됩니다.',
                        )
                      }
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      텍스트 주문 변환
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 미리보기 — 택배변환과 유사한 블록 */}
        <section className="relative pb-2 pt-1">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gray-900">미리보기</h3>
            <Link
              href="/order/integration/shipments"
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              송장 매칭·전송
            </Link>
          </div>
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-10 text-center">
            <p className="max-w-md text-sm leading-relaxed text-gray-500">
              주문조회·파일·텍스트로 주문을 가져오면 변환 결과가 여기에 표시됩니다.
              <br />
              파일 크기·건수에 따라 처리 시간이 달라질 수 있습니다.
            </p>
          </div>
        </section>

        {/* 하단 3카드 — 택배변환과 동일 스타일 */}
        <section className="relative pb-4 pt-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
            <button
              type="button"
              onClick={() =>
                showSkeletonNotice('양식 등록은 다음 단계에서 택배변환 기능을 재사용합니다.')
              }
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Truck className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  택배 업로드 양식 등록
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                실제 택배사 업로드에 사용하는 엑셀 양식을 등록해주세요.
                <br />
                등록하신 양식 그대로 자동 설정됩니다.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                showSkeletonNotice('고정 입력은 다음 단계에서 택배변환 기능을 재사용합니다.')
              }
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <Search className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  고정 입력 정보 설정
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                보내는 사람 정보 등 모든 주문에 공통으로 적용되는 값을
                <br />
                미리 등록하여 매번 입력하는 번거로움을 줄일 수 있습니다.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                showSkeletonNotice('다운로드는 다음 단계에서 택배변환 기능을 재사용합니다.')
              }
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  <ArrowDown className="h-5 w-5 text-gray-500" />
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  택배 업로드 파일 다운로드
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                변환이 완료된 주문데이터를 미리보기 기준으로
                <br />
                택배사 업로드용 파일로 내려받는 단계입니다.
              </p>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
