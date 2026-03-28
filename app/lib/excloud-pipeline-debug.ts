/**
 * 파이프라인 디버그 스위치 (Stage2/3 코어 파일은 건드리지 않음)
 *
 * .env.local / 배포 환경:
 *   EXCLOUD_DEBUG_PIPELINE=1                    → 서버(order-pipeline API) 상세 로그
 *   NEXT_PUBLIC_EXCLOUD_DEBUG_PIPELINE=1      → 브라우저(Stage2 표 + Stage3 매핑 표)
 */

export function isExcloudPipelineDebugServer(): boolean {
  return process.env.EXCLOUD_DEBUG_PIPELINE === '1';
}

export function isExcloudPipelineDebugClient(): boolean {
  return process.env.NEXT_PUBLIC_EXCLOUD_DEBUG_PIPELINE === '1';
}
