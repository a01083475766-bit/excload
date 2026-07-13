'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { WorkspaceBlockingModalOverlay } from '@/app/components/WorkspaceBlockingModalOverlay';
import { runTemplatePipeline } from '@/app/pipeline/template/template-pipeline';
import type { TemplateBridgeFile } from '@/app/pipeline/template/types';
import { resolveUserCustomFormatDisplayName } from '@/app/lib/user-custom-format';
import {
  buildTemplateHeaderLogPayload,
  logTemplateHeaderUpload,
} from '@/app/lib/template-header-log';
import {
  isDefaultCjSeedFormat,
  ORDER_DEFAULT_CJ_OPT_OUT_KEY,
  setDefaultCjAutoSeedOptOut,
} from '@/app/lib/default-cj-courier-template';
import {
  applyFormatAsActive,
  extractNonEmptyHeaderNames,
  loadCourierUploadTemplate,
  loadRecentExcelFormats,
  matchFormatIdByTemplate,
  saveActiveBridgeFile,
  saveCourierUploadTemplate,
  saveRecentExcelFormat,
  saveRecentExcelFormatsList,
  templateFromBridge,
  updateFormatDisplayName,
  type CourierUploadTemplate,
  type RecentExcelFormat,
} from '@/app/lib/courier-upload-template-storage';

type Props = {
  open: boolean;
  userId: string | null;
  /** 미리보기 등 작업 데이터가 있으면 양식 변경 시 재업로드 안내 */
  hasOrderWork: boolean;
  onClose: () => void;
  onApplied: (result: {
    bridgeFile: TemplateBridgeFile | null;
    template: CourierUploadTemplate | null;
    formatChanged: boolean;
    shouldClearPreview: boolean;
  }) => void;
};

function hasDirectHeaderMappings(
  bridgeFile: TemplateBridgeFile | null | undefined,
): bridgeFile is TemplateBridgeFile & { directHeaderMappings: Record<string, string | null> } {
  return Boolean(
    bridgeFile &&
      bridgeFile.directHeaderMappings &&
      Object.keys(bridgeFile.directHeaderMappings).length > 0,
  );
}

/** 쇼핑몰주문연동 허브 — 택배 업로드 양식 등록 (택배변환과 동일 저장 키) */
export function OrderIntegrationTemplateModal({
  open,
  userId,
  hasOrderWork,
  onClose,
  onApplied,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baselineFormatIdRef = useRef<string | null>(null);

  const [recentFormats, setRecentFormats] = useState<RecentExcelFormat[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<CourierUploadTemplate | null>(null);
  const [tempSelectedFormatId, setTempSelectedFormatId] = useState<string | null>(null);
  const [showRecentList, setShowRecentList] = useState(true);
  const [registrationSuccessMessage, setRegistrationSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    setRegistrationSuccessMessage(null);
    setEditingFormatId(null);
    setEditingDisplayName('');
    setBusy(false);

    const formats = loadRecentExcelFormats(userId);
    const template = loadCourierUploadTemplate(userId);
    const matchedId = matchFormatIdByTemplate(formats, template);

    setRecentFormats(formats);
    setActiveTemplate(template);
    setTempSelectedFormatId(matchedId);
    baselineFormatIdRef.current = matchedId;
    setShowRecentList(formats.length > 0);
  }, [open, userId]);

  const persistActive = (
    template: CourierUploadTemplate,
    bridgeFile: TemplateBridgeFile,
  ) => {
    saveCourierUploadTemplate(template, userId);
    saveActiveBridgeFile(bridgeFile, userId);
    setActiveTemplate(template);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setErrorMessage(null);
    try {
      const sessionId = crypto.randomUUID();
      const templateResult = await runTemplatePipeline(file, undefined, sessionId);
      const template = templateFromBridge(templateResult.bridgeFile);
      persistActive(template, templateResult.bridgeFile);

      const newFormatId = saveRecentExcelFormat({
        template,
        userId,
        bridgeFile: templateResult.bridgeFile,
      });
      setRecentFormats(loadRecentExcelFormats(userId));
      if (newFormatId) {
        setTempSelectedFormatId(newFormatId);
      }
      setShowRecentList(true);

      logTemplateHeaderUpload(
        buildTemplateHeaderLogPayload(templateResult.bridgeFile, {
          page: 'order-integration-hub',
          fileSessionId: sessionId,
          templateId: newFormatId ?? undefined,
        }),
      );

      setRegistrationSuccessMessage('등록이 완료되었습니다');
      window.setTimeout(() => setRegistrationSuccessMessage(null), 3500);
    } catch (error) {
      console.error('허브 양식 등록 오류:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '엑셀 파일을 읽는 중 오류가 발생했습니다.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSelectFormat = (formatId: string) => {
    const selected = recentFormats.find((format) => format.id === formatId);
    if (!selected) return;
    setTempSelectedFormatId(formatId);
    if (!selected.bridgeFile) {
      setErrorMessage('이 양식에 저장된 브릿지 정보가 없습니다. 파일을 다시 등록해 주세요.');
      return;
    }
    const { template, bridgeFile } = applyFormatAsActive(selected, userId);
    setActiveTemplate(template);
    if (!bridgeFile) {
      setErrorMessage('이 양식에 저장된 브릿지 정보가 없습니다. 파일을 다시 등록해 주세요.');
    } else {
      setErrorMessage(null);
    }
  };

  const handleConfirmEditName = (formatId: string) => {
    const updated = updateFormatDisplayName(formatId, editingDisplayName, userId);
    setRecentFormats(updated);
    setEditingFormatId(null);
    setEditingDisplayName('');
  };

  const handleDeleteFormat = (formatId: string) => {
    if (!confirm('이 양식을 삭제하시겠습니까?')) return;
    const formats = loadRecentExcelFormats(userId);
    const formatToDelete = formats.find((format) => format.id === formatId);
    if (!formatToDelete) return;

    try {
      if (isDefaultCjSeedFormat(formatToDelete)) {
        setDefaultCjAutoSeedOptOut(userId, ORDER_DEFAULT_CJ_OPT_OUT_KEY);
        saveCourierUploadTemplate(null, userId);
        saveActiveBridgeFile(null, userId);
        setActiveTemplate(null);
      } else if (activeTemplate) {
        const currentHeaders = extractNonEmptyHeaderNames(activeTemplate);
        const formatHeaders = formatToDelete.columnOrder || [];
        if (
          currentHeaders.length === formatHeaders.length &&
          currentHeaders.every((header, index) => header === formatHeaders[index])
        ) {
          saveCourierUploadTemplate(null, userId);
          saveActiveBridgeFile(null, userId);
          setActiveTemplate(null);
        }
      }

      const updated = formats.filter((format) => format.id !== formatId);
      saveRecentExcelFormatsList(updated, userId);
      setRecentFormats(updated);
      if (tempSelectedFormatId === formatId) {
        setTempSelectedFormatId(null);
      }
    } catch (error) {
      console.error('양식 삭제 오류:', error);
      setErrorMessage('양식을 삭제하는 중 오류가 발생했습니다.');
    }
  };

  const handleConfirm = () => {
    const formatChanged = tempSelectedFormatId !== baselineFormatIdRef.current;
    const shouldClearPreview = formatChanged && hasOrderWork;

    let bridgeFile: TemplateBridgeFile | null = null;
    if (tempSelectedFormatId) {
      const selected = recentFormats.find((f) => f.id === tempSelectedFormatId);
      if (selected?.bridgeFile) {
        bridgeFile = JSON.parse(JSON.stringify(selected.bridgeFile)) as TemplateBridgeFile;
      }
    }

    onApplied({
      bridgeFile,
      template: activeTemplate,
      formatChanged,
      shouldClearPreview,
    });
    onClose();
  };

  return (
    <WorkspaceBlockingModalOverlay open={open} aria-labelledby="hub-template-modal-title">
      <div className="flex h-[90vh] w-full max-w-[900px] flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xl sm:h-[798px] sm:max-h-[798px] sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <h2
            id="hub-template-modal-title"
            className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            업로드 양식 등록 선택
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          <div className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-800">
            <h3 className="mb-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
              이미 사용 중인 택배사 업로드 파일이 있으신가요?
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              지금 택배사에 올리는 업로드 엑셀을 등록하면,
              <br />
              그 양식 그대로 자동 설정됩니다.
              <br />
              택배사·양식이 여러 개면 추가로 등록해 목록에서 관리·선택할 수 있습니다.
            </p>
            <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              내 업로드 파일: 계약 택배사에서 안내받은 “업로드용 엑셀 파일” 또는 실제 택배사
              프로그램에 첨부하는 “엑셀파일”입니다.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="h-11 w-full rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '등록 중…' : '내 업로드 파일 등록하기'}
            </button>
            <Link
              href="/order-convert"
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70"
            >
              사용자 지정양식 만들기 (택배주문변환)
            </Link>
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-relaxed text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              사용자 지정양식: 주문 파일 헤더를 직접 연결해 원하는 열 순서로 만드는 다운로드 엑셀
              양식입니다. 허브에서는 택배주문변환에서 만든 뒤 여기서 선택해 사용합니다.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              택배주문변환과 같은 저장값을 사용합니다.
            </p>
            {registrationSuccessMessage ? (
              <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                {registrationSuccessMessage}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
            ) : null}
          </div>

          {recentFormats.length > 0 ? (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowRecentList((prev) => !prev)}
                className="w-full rounded-lg border border-zinc-300 bg-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                  등록된 양식 ({recentFormats.length})
                </span>
              </button>

              {showRecentList
                ? recentFormats.map((format, index) => {
                    const savedDate = new Date(format.createdAt);
                    const dateStr = `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(2, '0')}-${String(savedDate.getDate()).padStart(2, '0')} ${String(savedDate.getHours()).padStart(2, '0')}:${String(savedDate.getMinutes()).padStart(2, '0')}`;
                    const isEditing = editingFormatId === format.id;
                    const directBridgeFile = hasDirectHeaderMappings(format.bridgeFile)
                      ? format.bridgeFile
                      : null;
                    const isDirectFileFormat = Boolean(directBridgeFile);
                    const defaultDisplayName =
                      recentFormats.length > 1
                        ? `등록된 엑셀 양식 ${index + 1}`
                        : '등록된 엑셀 양식';
                    const displayName = resolveUserCustomFormatDisplayName(
                      format.displayName,
                      defaultDisplayName,
                    );
                    const directMappingEntries = directBridgeFile
                      ? format.columnOrder.map((outputHeader) => ({
                          outputHeader,
                          sourceHeader: directBridgeFile.directHeaderMappings[outputHeader] ?? '',
                        }))
                      : [];

                    return (
                      <div
                        key={`${format.id}-${index}`}
                        className="min-h-[120px] w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 pt-0.5">
                            <input
                              type="radio"
                              name="hubSelectedFormat"
                              checked={tempSelectedFormatId === format.id}
                              onChange={() => handleSelectFormat(format.id)}
                              className="h-4 w-4 border-gray-300 text-blue-600 dark:border-gray-600 dark:bg-zinc-800"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-start justify-between">
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <div className="flex flex-nowrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingDisplayName}
                                      onChange={(e) => setEditingDisplayName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleConfirmEditName(format.id);
                                        if (e.key === 'Escape') {
                                          setEditingFormatId(null);
                                          setEditingDisplayName('');
                                        }
                                      }}
                                      autoFocus
                                      className="w-[40%] min-w-0 rounded border border-zinc-300 bg-white px-2 py-1 text-sm sm:min-w-[240px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                      placeholder="양식 이름을 입력하세요"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmEditName(format.id)}
                                      className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 sm:whitespace-nowrap"
                                    >
                                      확인
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFormatId(null);
                                        setEditingDisplayName('');
                                      }}
                                      className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-900 sm:whitespace-nowrap"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                    {displayName}
                                  </span>
                                )}
                                {isDirectFileFormat && !isEditing ? (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                    이 파일 헤더 전용
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-2">
                                {!isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFormatId(format.id);
                                        setEditingDisplayName(format.displayName || '');
                                      }}
                                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
                                    >
                                      이름 변경하기
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFormat(format.id)}
                                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700"
                                    >
                                      삭제
                                    </button>
                                  </>
                                ) : null}
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {dateStr}
                                </span>
                              </div>
                            </div>

                            <div
                              className={`h-[22px] ${
                                tempSelectedFormatId === format.id ? 'visible' : 'invisible'
                              }`}
                            >
                              <div className="mb-1 mt-0.5 text-xs text-green-600 dark:text-green-400">
                                ✔ 이 양식이 사용됩니다
                              </div>
                            </div>

                            <div className="mb-2 text-xs text-gray-600 dark:text-gray-400">
                              {isDirectFileFormat ? (
                                <div className="space-y-2">
                                  <div className="rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                    이 양식은 등록할 때 사용한 주문파일의 원본 헤더와 연결됩니다.
                                    다른 구조의 파일에는 값이 비어 보일 수 있습니다.
                                  </div>
                                  <div className="grid gap-1 sm:grid-cols-2">
                                    {directMappingEntries.map((entry, idx) => (
                                      <div
                                        key={`${entry.outputHeader}-${idx}`}
                                        className="rounded border border-amber-100 bg-white px-2 py-1 dark:border-amber-900 dark:bg-zinc-900"
                                      >
                                        <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                                          {idx + 1}. 출력: {entry.outputHeader || '(빈 헤더)'}
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                          원본: {entry.sourceHeader || '새 헤더(빈 값)'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : Array.isArray(format.columnOrder) &&
                                format.columnOrder.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {format.columnOrder.map((headerName, idx) => (
                                    <span
                                      key={`${headerName}-${idx}`}
                                      className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                                    >
                                      {headerName || '(빈 헤더)'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                  헤더 정보 없음
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            등록된 양식은 브라우저에 안전하게 저장되며, 택배주문변환과 공유됩니다.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </WorkspaceBlockingModalOverlay>
  );
}
