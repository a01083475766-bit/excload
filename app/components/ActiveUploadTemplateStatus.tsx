'use client';

interface CourierUploadTemplate {
  courierType: string | null;
  headers: Array<{ name: string; index: number; isEmpty: boolean }>;
  requiresSender?: boolean;
  internalHeaderMap?: Array<{
    originalHeader: string;
    internalKey: string | null;
  }>;
}

interface ActiveUploadTemplateStatusProps {
  courierUploadTemplate: CourierUploadTemplate | null;
}

export default function ActiveUploadTemplateStatus({
  courierUploadTemplate,
}: ActiveUploadTemplateStatusProps) {
  // internalHeaderMap이 없으면 렌더하지 않음
  if (
    !courierUploadTemplate?.internalHeaderMap ||
    !Array.isArray(courierUploadTemplate.internalHeaderMap) ||
    courierUploadTemplate.internalHeaderMap.length === 0
  ) {
    return null;
  }

  // 헤더 목록 생성 (originalHeader만 사용)
  const headerList = courierUploadTemplate.internalHeaderMap
    .map((item) => item.originalHeader)
    .filter((header) => header && header.trim() !== '')
    .join(' · ');

  if (!headerList) {
    return null;
  }

  return (
    <div className="mb-2">
      <p className="text-xs text-gray-600 truncate">
        {headerList}
      </p>
    </div>
  );
}
