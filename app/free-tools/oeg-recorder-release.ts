/**
 * OEG 녹화 Windows ZIP — GitHub Release 첨부 메타.
 * ZIP 본문은 레포에 커밋하지 않고 Release 첨부파일로만 배포합니다.
 */
export const OEG_RECORDER_DOWNLOAD_STAT_KEY = 'oeg-recorder' as const;

export const OEG_RECORDER_RELEASE = {
  version: '0.9.0',
  versionLabel: 'v0.9.0 베타',
  fileName: 'OEGRecorder-v0.9.0-win-x64.zip',
  /** 약 60.8MB (재포장본 바이트) */
  sizeBytes: 63_776_292,
  sizeLabel: '약 60.8MB',
  sha256: '7FC1606EB57B939E0663659E2F287A02DE22609FEC79679E9AC4908AF86C3B0E',
  platformLabel: 'Windows 10/11 x64',
  /**
   * GitHub Release 태그 `oeg-recorder-v0.9.0` 첨부 URL.
   * Release 생성 전에는 404일 수 있으니, 업로드 후 브라우저에서 한 번 확인해 주세요.
   */
  downloadUrl:
    'https://github.com/a01083475766-bit/excload/releases/download/oeg-recorder-v0.9.0/OEGRecorder-v0.9.0-win-x64.zip',
} as const;

export function formatOegRecorderSizeMb(bytes = OEG_RECORDER_RELEASE.sizeBytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
