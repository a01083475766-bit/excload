'use client';

type WorkspaceFormStatusVariant = 'blue' | 'emerald';

interface WorkspaceFormStatusBannerProps {
  /** 세션·계정별 저장소 복원이 끝나기 전 true */
  isChecking: boolean;
  /** 등록된 양식 헤더명 (없으면 null) */
  templateHeaderNames: string[] | null;
  fixedHeaderOrder: string[];
  fixedHeaderValues: Record<string, string>;
  variant?: WorkspaceFormStatusVariant;
}

function StatusCheckingLine({
  label,
  chipClassName,
  textClassName,
}: {
  label: string;
  chipClassName: string;
  textClassName: string;
}) {
  return (
    <p className={`text-xs ${textClassName} w-full flex items-center gap-2 min-h-[1.25rem]`}>
      <span className={chipClassName}>{label}</span>
      <span
        className="inline-block h-3 flex-1 max-w-[10rem] rounded opacity-30 bg-current animate-pulse"
        aria-hidden
      />
    </p>
  );
}

/**
 * 변환 화면 하단 「사용 중인 양식」「고정 입력 정보」 영역.
 * auth·localStorage 복원 대기 중에는 「양식 확인중」「고정 입력 확인중」 표시.
 */
export function WorkspaceFormStatusBanner({
  isChecking,
  templateHeaderNames,
  fixedHeaderOrder,
  fixedHeaderValues,
  variant = 'blue',
}: WorkspaceFormStatusBannerProps) {
  const textClass = variant === 'emerald' ? 'text-emerald-600' : 'text-blue-600';
  const textMutedClass = variant === 'emerald' ? 'text-emerald-500' : 'text-blue-500';
  const chipClass =
    variant === 'emerald'
      ? 'trial-soft-chip inline-block py-0.5 px-2 rounded-md text-xs font-medium'
      : 'inline-block py-0.5 px-2 rounded-md text-xs font-medium bg-blue-50 text-blue-600';

  const fixedEntries = fixedHeaderOrder.filter(
    (name) => fixedHeaderValues[name] && fixedHeaderValues[name].trim() !== '',
  );

  if (isChecking) {
    return (
      <div className="w-full mt-4 space-y-1" aria-live="polite" aria-busy="true">
        <StatusCheckingLine label="양식 확인중" chipClassName={chipClass} textClassName={textClass} />
        <StatusCheckingLine
          label="고정 입력 확인중"
          chipClassName={chipClass}
          textClassName={textMutedClass}
        />
      </div>
    );
  }

  const hasTemplate = Boolean(templateHeaderNames && templateHeaderNames.length > 0);
  const hasFixed = fixedEntries.length > 0;

  if (!hasTemplate && !hasFixed) {
    return null;
  }

  return (
    <div className="w-full mt-4">
      {hasTemplate && templateHeaderNames && (
        <p className={`text-xs ${textClass} w-full whitespace-nowrap overflow-hidden text-ellipsis`}>
          <span className={chipClass}>사용 중인 양식 :</span>{' '}
          {templateHeaderNames.join(' · ')}
        </p>
      )}
      {hasFixed && (
        <p
          className={`text-xs ${textMutedClass} w-full whitespace-nowrap overflow-hidden text-ellipsis ${
            hasTemplate ? 'mt-1' : ''
          }`}
        >
          <span className={chipClass}>고정 입력 정보 :</span>{' '}
          {fixedEntries.map((name) => `${name} ${fixedHeaderValues[name]}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
