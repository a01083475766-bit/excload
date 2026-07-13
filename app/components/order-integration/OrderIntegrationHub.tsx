'use client';

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  Truck,
  Search,
  ArrowDown,
  Link2,
  Upload,
  CalendarDays,
  Coins,
  Loader2,
} from 'lucide-react';
import { useUserStore } from '@/app/store/userStore';
import { useExcelFileUnlock } from '@/app/hooks/useExcelFileUnlock';
import { ExcelUnlockCancelledError } from '@/app/lib/excel/protected-file-types';
import { extractTextFromImage } from '@/app/unified-input/adapters/ImageToTextAdapter';
import {
  OrderConvertPreviewTableRow,
  type PreviewRowWithId,
} from '@/app/order-convert/OrderConvertPreviewTableRow';
import {
  buildPreviewDownloadAoA,
  buildPreviewDownloadFileName,
  createPreviewDownloadWorkbook,
} from '@/app/lib/excel/preview-download-xlsx';
import {
  convertExcelBufferToHubPreview,
  convertTextToHubPreview,
  deductHubConvertPoints,
  loadHubFixedHeaderValues,
  loadHubTemplateBridge,
} from '@/app/lib/order-integration/order-integration-hub-convert';

/**
 * 쇼핑몰주문연동 허브 — 미연동 몰 파일·텍스트 변환 + 미리보기.
 * 택배변환과 동일 파이프라인·양식 키(ORDER_CONVERT_KEYS)를 사용합니다.
 */
export default function OrderIntegrationHub() {
  const user = useUserStore((state) => state.user);
  const fetchUser = useUserStore((state) => state.fetchUser);
  const userId = user?.userId ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [textOrder, setTextOrder] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [hubNotice, setHubNotice] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);

  const [previewRows, setPreviewRows] = useState<PreviewRowWithId[]>([]);
  const [courierHeaders, setCourierHeaders] = useState<string[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<'file' | 'text' | 'download' | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const { unlockExcelFile, excelUnlockUi } = useExcelFileUnlock();

  const showNotice = (message: string) => {
    setHubError(null);
    setHubNotice(message);
  };

  const showError = (message: string) => {
    setHubNotice(null);
    setHubError(message);
  };

  const markNewRows = useCallback((rowIds: string[]) => {
    setNewRowIds((prev) => {
      const next = new Set(prev);
      rowIds.forEach((id) => next.add(id));
      return next;
    });
    window.setTimeout(() => {
      setNewRowIds((prev) => {
        const next = new Set(prev);
        rowIds.forEach((id) => next.delete(id));
        return next;
      });
    }, 3000);
  }, []);

  const appendPreview = useCallback(
    (rows: PreviewRowWithId[], headers: string[]) => {
      setCourierHeaders(headers);
      setPreviewRows((prev) => [...rows, ...prev]);
      markNewRows(rows.map((row) => row.rowId));
    },
    [markNewRows],
  );

  const onFilesChosen = (files: FileList | File[]) => {
    const list = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      return (
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png') ||
        name.endsWith('.gif') ||
        name.endsWith('.webp')
      );
    });
    if (list.length === 0) {
      showError('엑셀(.xlsx/.xls) 또는 이미지 파일만 선택할 수 있습니다.');
      return;
    }
    setSelectedFiles((prev) => [...prev, ...list]);
    setHubError(null);
    setHubNotice(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) {
      onFilesChosen(event.dataTransfer.files);
    }
  };

  const handleFileConvert = async () => {
    if (busy || selectedFiles.length === 0) return;
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }

    setBusy('file');
    setHubError(null);
    setHubNotice(null);

    try {
      const bridge = loadHubTemplateBridge(userId);
      const fixed = loadHubFixedHeaderValues(userId);
      let added = 0;

      for (const file of selectedFiles) {
        const name = file.name.toLowerCase();
        const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
        const isImage =
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.png') ||
          name.endsWith('.gif') ||
          name.endsWith('.webp') ||
          file.type.startsWith('image/');

        if (isExcel) {
          setStatusLabel(`${file.name} 엑셀 변환 중…`);
          let buffer: ArrayBuffer;
          try {
            buffer = await unlockExcelFile(file);
          } catch (error) {
            if (error instanceof ExcelUnlockCancelledError) continue;
            throw error;
          }
          const result = await convertExcelBufferToHubPreview({
            buffer,
            templateBridgeFile: bridge,
            fixedHeaderValues: fixed,
            onStage2ChunkProgress: (completed, total) => {
              if (total > 1) setStatusLabel(`서버 변환 ${completed}/${total}`);
            },
          });
          appendPreview(result.previewRows, result.courierHeaders);
          added += result.previewRows.length;
          continue;
        }

        if (isImage) {
          setStatusLabel(`${file.name} 이미지 인식 중…`);
          const ocrText = await extractTextFromImage(file);
          if (!ocrText.trim()) {
            throw new Error(`${file.name}: 이미지에서 텍스트를 읽지 못했습니다.`);
          }
          setStatusLabel('주문 텍스트 변환 중…');
          const result = await convertTextToHubPreview({
            text: ocrText,
            templateBridgeFile: bridge,
            fixedHeaderValues: fixed,
            onStage2ChunkProgress: (completed, total) => {
              if (total > 1) setStatusLabel(`서버 변환 ${completed}/${total}`);
            },
          });
          const pointsOk = await deductHubConvertPoints(Math.max(1, ocrText.trim().length), 'text');
          if (!pointsOk) {
            throw new Error('사용량 차감에 실패했습니다. 잔여 사용량을 확인해 주세요.');
          }
          void fetchUser();
          appendPreview(result.previewRows, result.courierHeaders);
          added += result.previewRows.length;
        }
      }

      setSelectedFiles([]);
      setStatusLabel(null);
      showNotice(`변환 완료 · 미리보기에 ${added.toLocaleString()}건이 추가되었습니다.`);
    } catch (error) {
      setStatusLabel(null);
      showError(error instanceof Error ? error.message : '파일 변환 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const handleTextConvert = async () => {
    if (busy || !textOrder.trim()) return;
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }
    if (user.points < 1) {
      showError('사용량이 부족합니다.');
      return;
    }

    setBusy('text');
    setHubError(null);
    setHubNotice(null);
    setStatusLabel('주문 텍스트 분석 중…');

    try {
      const bridge = loadHubTemplateBridge(userId);
      const fixed = loadHubFixedHeaderValues(userId);
      const trimmed = textOrder.trim();
      const result = await convertTextToHubPreview({
        text: trimmed,
        templateBridgeFile: bridge,
        fixedHeaderValues: fixed,
        onStage2ChunkProgress: (completed, total) => {
          if (total > 1) setStatusLabel(`서버 변환 ${completed}/${total}`);
        },
      });

      const pointsOk = await deductHubConvertPoints(Math.max(1, trimmed.length), 'text');
      if (!pointsOk) {
        throw new Error('사용량 차감에 실패했습니다. 잔여 사용량을 확인해 주세요.');
      }
      void fetchUser();

      appendPreview(result.previewRows, result.courierHeaders);
      setTextOrder('');
      setStatusLabel(null);
      showNotice(
        `텍스트 변환 완료 · 미리보기에 ${result.previewRows.length.toLocaleString()}건이 추가되었습니다.`,
      );
    } catch (error) {
      setStatusLabel(null);
      showError(error instanceof Error ? error.message : '텍스트 변환 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (busy || previewRows.length === 0 || courierHeaders.length === 0) return;
    if (!user) {
      showError('로그인이 필요합니다.');
      return;
    }

    setBusy('download');
    setHubError(null);
    try {
      const aoa = buildPreviewDownloadAoA(courierHeaders, previewRows, {});
      const wb = createPreviewDownloadWorkbook(aoa);
      const fileName = buildPreviewDownloadFileName(new Date(), '엑클로드주문연동');
      const pointsOk = await deductHubConvertPoints(1, 'download');
      if (!pointsOk) {
        throw new Error('사용량 차감에 실패했습니다. 잔여 사용량을 확인해 주세요.');
      }
      void fetchUser();
      XLSX.writeFile(wb, fileName);
      showNotice(`다운로드 완료 · ${fileName}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : '다운로드 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const clearPreview = () => {
    setPreviewRows([]);
    setCourierHeaders([]);
    setSelectedRowIds(new Set());
    setNewRowIds(new Set());
    showNotice('미리보기를 비웠습니다.');
  };

  const deleteSelectedRows = () => {
    if (selectedRowIds.size === 0) return;
    setPreviewRows((prev) => prev.filter((row) => !selectedRowIds.has(row.rowId)));
    setSelectedRowIds(new Set());
  };

  const previewEmpty = previewRows.length === 0;
  const displayHeaders = useMemo(() => courierHeaders, [courierHeaders]);

  return (
    <div className="bg-zinc-50 pb-4 pt-1.5 dark:bg-black">
      {excelUnlockUi}
      <main className="mx-auto max-w-[1200px] px-3 sm:px-5 lg:px-8">
        <section className="relative pb-3 pt-1">
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

            {statusLabel ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                {statusLabel}
              </div>
            ) : null}

            {hubNotice ? (
              <div
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                role="status"
              >
                {hubNotice}
              </div>
            ) : null}

            {hubError ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {hubError}
              </div>
            ) : null}

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
                          선택된 파일: {selectedFiles[0]?.name}
                          {selectedFiles.length > 1 ? ` 외 ${selectedFiles.length - 1}개` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) onFilesChosen(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={selectedFiles.length === 0 || busy !== null}
                    onClick={() => void handleFileConvert()}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === 'file' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                      disabled={busy !== null}
                      placeholder={
                        '예) 홍길동 010-1234-5766   무선마우스 2개\n' +
                        '서울시 강남구 테헤란로 123  문앞에 놓아주세요'
                      }
                      className="min-h-[180px] w-full flex-1 basis-0 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                    />
                    <button
                      type="button"
                      disabled={!textOrder.trim() || busy !== null}
                      onClick={() => void handleTextConvert()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      텍스트 주문 변환
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative pb-2 pt-1">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              미리보기
              {!previewEmpty ? (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {previewRows.length.toLocaleString()}건
                </span>
              ) : null}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {!previewEmpty ? (
                <>
                  <button
                    type="button"
                    onClick={deleteSelectedRows}
                    disabled={selectedRowIds.size === 0 || busy !== null}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    선택 삭제
                  </button>
                  <button
                    type="button"
                    onClick={clearPreview}
                    disabled={busy !== null}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    전체 비우기
                  </button>
                </>
              ) : null}
              <Link
                href="/order/integration/shipments"
                className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                송장 매칭·전송
              </Link>
            </div>
          </div>

          {previewEmpty ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-10 text-center">
              <p className="max-w-md text-sm leading-relaxed text-gray-500">
                주문조회·파일·텍스트로 주문을 가져오면 변환 결과가 여기에 표시됩니다.
                <br />
                파일 크기·건수에 따라 처리 시간이 달라질 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-100">
                  <tr>
                    <th className="w-10 border-b border-zinc-200 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={
                          previewRows.length > 0 &&
                          previewRows.every((row) => selectedRowIds.has(row.rowId))
                        }
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedRowIds(new Set(previewRows.map((row) => row.rowId)));
                          } else {
                            setSelectedRowIds(new Set());
                          }
                        }}
                        aria-label="전체 선택"
                      />
                    </th>
                    {displayHeaders.map((header) => (
                      <th
                        key={header}
                        className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 font-semibold text-zinc-700"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <OrderConvertPreviewTableRow
                      key={row.rowId}
                      row={row}
                      courierHeaders={displayHeaders}
                      overridesForRow={undefined}
                      isSelected={selectedRowIds.has(row.rowId)}
                      isNewRow={newRowIds.has(row.rowId)}
                      localEditingHeader={null}
                      localEditingValue=""
                      localActiveHeader={null}
                      onToggleSelect={(rowId, checked) => {
                        setSelectedRowIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(rowId);
                          else next.delete(rowId);
                          return next;
                        });
                      }}
                      onCellClickStartEdit={() => undefined}
                      onEditingInputChange={() => undefined}
                      onCommitEdit={() => undefined}
                      onFinishEditUi={() => undefined}
                      interactionEnabled
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="relative pb-4 pt-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
            <Link
              href="/order-convert"
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
                택배주문변환과 양식을 공유합니다.
                <br />
                등록·변경은 택배주문변환에서 진행해 주세요.
              </p>
            </Link>

            <Link
              href="/order-convert"
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
                보내는 사람 등 고정값은 택배주문변환과 공유됩니다.
                <br />
                설정 후 이 화면 변환에 자동 반영됩니다.
              </p>
            </Link>

            <button
              type="button"
              disabled={previewEmpty || busy !== null}
              onClick={() => void handleDownload()}
              className="flex h-[120px] flex-col justify-center rounded-xl border border-gray-300 bg-gray-200 p-5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mb-2 flex items-center justify-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                  {busy === 'download' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  ) : (
                    <ArrowDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <h3 className="text-center text-sm font-semibold text-gray-900">
                  택배 업로드 파일 다운로드
                </h3>
              </div>
              <p className="mt-1 text-center text-xs text-gray-500">
                미리보기 기준으로 택배사 업로드용 엑셀을
                <br />
                내려받습니다.
              </p>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
