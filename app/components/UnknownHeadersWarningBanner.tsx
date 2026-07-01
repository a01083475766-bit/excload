'use client';

export type UnknownHeaderSamples = Record<string, string[]>;

export type UnknownHeadersWarningVariant = 'courier' | 'logistics' | 'invoice';

type UnknownHeadersWarningBannerProps = {
  unknownHeaders: string[];
  unknownHeaderSamples: UnknownHeaderSamples;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  variant: UnknownHeadersWarningVariant;
  trialMode?: boolean;
  onDirectMapping?: () => void;
};

const variantCopy = {
  courier: {
    intro:
      '아래 항목은 실제 값이 들어 있지만, 현재 선택한 출력 양식의 어느 칸에 넣어야 할지 자동 판단하지 못했습니다. 필요한 정보라면 사용자 지정양식에서 직접 연결해 주세요.',
    neededInfo:
      '택배사 업로드양식에 해당 정보를 넣을 칸이 있는지 확인한 뒤, 미리보기에서 알맞은 항목으로 지정하거나 원본 엑셀의 열 이름을 수정한 뒤 다시 올려 주세요.',
    notNeededInfo:
      '택배사 업로드에 사용하지 않는 주문 관리용 정보일 수 있으므로, 그대로 진행하고 다운로드하셔도 됩니다.',
    finalCheck: '※ 다운로드 전 주문 정보가 빠짐없이 정리되었는지 한 번 더 확인해 주세요.',
    headerColor: 'text-blue-600',
    itemNameColor: 'text-blue-700',
    actionButtonClass: 'rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700',
  },
  logistics: {
    intro:
      '아래 항목은 실제 값이 들어 있지만, 현재 선택한 출력 양식의 어느 칸에 넣어야 할지 자동 판단하지 못했습니다. 필요한 정보라면 사용자 지정양식에서 직접 연결해 주세요.',
    neededInfo:
      '물류 업로드양식에 해당 정보를 넣을 칸이 있는지 확인한 뒤, 미리보기에서 알맞은 항목으로 지정하거나 원본 엑셀의 열 이름을 수정한 뒤 다시 올려 주세요.',
    notNeededInfoTrial:
      '물류 업로드에 사용하지 않는 주문 관리용 정보일 수 있으므로, 그대로 진행하고 결과를 확인하셔도 됩니다.',
    notNeededInfo:
      '물류 업로드에 사용하지 않는 주문 관리용 정보일 수 있으므로, 그대로 진행하고 다운로드하셔도 됩니다.',
    finalCheckTrial: '※ 미리보기에서 주문 정보가 빠짐없이 정리되었는지 한 번 더 확인해 주세요.',
    finalCheck: '※ 다운로드 전 주문 정보가 빠짐없이 정리되었는지 한 번 더 확인해 주세요.',
    headerColor: 'text-emerald-600',
    itemNameColor: 'text-emerald-700',
    actionButtonClassTrial:
      'rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700',
    actionButtonClass:
      'rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700',
  },
  invoice: {
    intro:
      '아래 항목은 실제 값이 들어 있지만, 현재 선택한 출력 양식의 어느 칸에 넣어야 할지 자동 판단하지 못했습니다.',
    neededInfo:
      '송장 업로드양식에 해당 정보를 넣을 칸이 있는지 확인한 뒤, 미리보기에서 알맞은 항목으로 지정하거나 원본 엑셀의 열 이름을 수정한 뒤 다시 올려 주세요.',
    notNeededInfo:
      '송장 업로드에 사용하지 않는 주문 관리용 정보일 수 있으므로, 그대로 진행하고 다운로드하셔도 됩니다.',
    finalCheck: '※ 다운로드 전 송장 정보가 빠짐없이 정리되었는지 한 번 더 확인해 주세요.',
    headerColor: 'text-blue-600',
    itemNameColor: 'text-blue-700',
    actionButtonClass: '',
  },
} as const;

export function partitionUnknownHeadersForDisplay(
  unknownHeaders: string[],
  unknownHeaderSamples: UnknownHeaderSamples,
): { headersWithSamples: string[]; emptyHeaderCount: number } {
  const headersWithSamples = unknownHeaders.filter(
    (header) => (unknownHeaderSamples[header] ?? []).length > 0,
  );
  return {
    headersWithSamples,
    emptyHeaderCount: unknownHeaders.length - headersWithSamples.length,
  };
}

export function UnknownHeadersWarningBanner({
  unknownHeaders,
  unknownHeaderSamples,
  expanded,
  onExpandedChange,
  variant,
  trialMode = false,
  onDirectMapping,
}: UnknownHeadersWarningBannerProps) {
  const { headersWithSamples, emptyHeaderCount } = partitionUnknownHeadersForDisplay(
    unknownHeaders,
    unknownHeaderSamples,
  );

  if (headersWithSamples.length === 0) {
    return null;
  }

  const copy = variantCopy[variant];
  const notNeededInfo =
    variant === 'logistics'
      ? trialMode
        ? variantCopy.logistics.notNeededInfoTrial
        : variantCopy.logistics.notNeededInfo
      : copy.notNeededInfo;
  const finalCheck =
    variant === 'logistics'
      ? trialMode
        ? variantCopy.logistics.finalCheckTrial
        : variantCopy.logistics.finalCheck
      : copy.finalCheck;
  const actionButtonClass =
    variant === 'logistics'
      ? trialMode
        ? variantCopy.logistics.actionButtonClassTrial
        : variantCopy.logistics.actionButtonClass
      : copy.actionButtonClass;

  return (
    <div className="mx-6 mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
      <p className="mb-2 font-semibold">
        주문 파일에서 자동으로 연결하지 못한 항목이 있습니다.
      </p>

      <p className="mb-3 leading-relaxed">{copy.intro}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          {expanded
            ? '확인이 필요한 항목 접기'
            : `확인이 필요한 항목 ${headersWithSamples.length}개 보기`}
        </button>
        {onDirectMapping && actionButtonClass ? (
          <button type="button" onClick={onDirectMapping} className={actionButtonClass}>
            직접 연결해서 저장하기
          </button>
        ) : null}
      </div>

      {expanded && (
        <div className="mt-3">
          <div className={`mb-2 text-base font-semibold ${copy.headerColor}`}>
            확인이 필요한 항목
          </div>

          <div className="mb-3 space-y-2">
            {headersWithSamples.map((header) => {
              const samples = unknownHeaderSamples[header] ?? [];
              return (
                <div
                  key={header}
                  className="rounded-md border border-amber-200 bg-white/70 px-3 py-2"
                >
                  <div className={`font-semibold ${copy.itemNameColor}`}>{header}</div>
                  <div className="mt-1 text-xs leading-relaxed text-amber-800">
                    예시 값: {samples.join(' / ')}
                  </div>
                </div>
              );
            })}
          </div>

          {emptyHeaderCount > 0 && (
            <p className="mb-3 text-xs leading-relaxed text-amber-700">
              값이 없는 빈 열 {emptyHeaderCount}개는 변환 결과에 영향이 적어 목록에서 제외했습니다.
            </p>
          )}

          <p className="mb-3 text-xs leading-relaxed text-amber-700">
            ※ 표시된 내용은 확인을 돕기 위한 예시이며, 개인정보는 일부 가려서 보여드립니다.
          </p>

          <div className="text-xs leading-relaxed text-amber-700">
            <strong>필요한 정보라면</strong>
            <br />
            {copy.neededInfo}
            <br />
            <br />
            <strong>필요하지 않은 정보라면</strong>
            <br />
            {notNeededInfo}
            <br />
            <br />
            {finalCheck}
          </div>
        </div>
      )}
    </div>
  );
}
