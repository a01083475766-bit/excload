/**
 * 내부 표준 주문 엑셀 형식 정의
 *
 * `BASE_HEADERS`와 1:1 대응합니다. 필드 추가 시 `base-headers.ts`만 늘리면 됩니다.
 *
 * ⚠️ 헌법 규칙:
 * - 기준헤더는 내부 처리 전용이며 UI, 미리보기, 다운로드에 직접 노출되면 안 됩니다.
 */

import type { BaseHeaderRow } from '@/app/pipeline/base/base-headers';

export type InternalOrderFormat = BaseHeaderRow;
