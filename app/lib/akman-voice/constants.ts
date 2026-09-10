/** CosyVoice zero-shot은 짧은 참조음에 최적화. 공식 Gradio는 10초 초과 시 품질 경고. */
export const VOICE_REF_MAX_DURATION_SECONDS = 30;
export const VOICE_REF_RECOMMENDED_DURATION = '3~10초';
export const VOICE_REF_MAX_BYTES = 20 * 1024 * 1024; // 20MB
export const VOICE_TEXT_MAX_CHARS = 1000;
export const VOICE_PROMPT_TEXT_MAX_CHARS = 2000;
export const VOICE_INSTRUCTION_MAX_CHARS = 500;
export const VOICE_NAME_MAX_CHARS = 80;
export const VOICE_SPEED_MIN = 0.5;
export const VOICE_SPEED_MAX = 1.5;
export const VOICE_SPEED_DEFAULT = 1.0;

export const VOICE_ALLOWED_MIME_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
]);

export const VOICE_ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a']);

export const VOICE_SERVICE_TIMEOUT_MS = 240_000;
/** Signed download for browser preview/download */
export const VOICE_BROWSER_DOWNLOAD_EXPIRES_SEC = 5 * 60;
/** Signed URLs handed to GPU worker for ref download + output upload */
export const VOICE_WORKER_URL_EXPIRES_SEC = 30 * 60;

