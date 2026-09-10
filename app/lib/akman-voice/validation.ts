import {
  VOICE_ALLOWED_EXTENSIONS,
  VOICE_ALLOWED_MIME_TYPES,
  VOICE_INSTRUCTION_MAX_CHARS,
  VOICE_NAME_MAX_CHARS,
  VOICE_PROMPT_TEXT_MAX_CHARS,
  VOICE_REF_MAX_BYTES,
  VOICE_REF_MAX_DURATION_SECONDS,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_TEXT_MAX_CHARS,
} from '@/app/lib/akman-voice/constants';

export function sanitizeVoiceOriginalName(name: string): string {
  const base = name.replace(/[/\\]/g, '').trim().slice(0, 180);
  return base || 'reference.wav';
}

export function voiceExtensionFromName(name: string): string | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = lower.slice(dot);
  return VOICE_ALLOWED_EXTENSIONS.has(ext) ? ext : null;
}

export function isAllowedVoiceMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return VOICE_ALLOWED_MIME_TYPES.has(mime.trim().toLowerCase());
}

export function normalizeVoiceMime(mime: string | null | undefined, ext: string | null): string {
  const m = (mime ?? '').trim().toLowerCase();
  if (VOICE_ALLOWED_MIME_TYPES.has(m)) {
    if (m === 'audio/wave' || m === 'audio/x-wav') return 'audio/wav';
    if (m === 'audio/mp3') return 'audio/mpeg';
    if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio/mp4';
    return m;
  }
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  return 'application/octet-stream';
}

/** WAV PCM duration from header when possible; otherwise null. */
export function tryReadWavDurationSeconds(bytes: Buffer): number | null {
  if (bytes.length < 44) return null;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (chunkId === 'fmt ' && dataStart + 16 <= bytes.length) {
      channels = bytes.readUInt16LE(dataStart + 2);
      sampleRate = bytes.readUInt32LE(dataStart + 4);
      bitsPerSample = bytes.readUInt16LE(dataStart + 14);
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataSize) return null;
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (bytesPerSecond <= 0) return null;
  return dataSize / bytesPerSecond;
}

export function validateReferenceUpload(input: {
  originalName: string;
  mimeType: string | null | undefined;
  sizeBytes: number;
  durationSeconds: number | null | undefined;
}): { ok: true; ext: string; mime: string } | { ok: false; error: string } {
  if (input.sizeBytes <= 0) {
    return { ok: false, error: '참조 음성 파일이 필요합니다.' };
  }
  if (input.sizeBytes > VOICE_REF_MAX_BYTES) {
    return { ok: false, error: '참조 음성 파일이 너무 큽니다. 20MB 이하로 올려주세요.' };
  }
  const ext = voiceExtensionFromName(input.originalName);
  if (!ext) {
    return { ok: false, error: '참조 음성은 WAV, MP3, M4A만 지원합니다.' };
  }
  const mime = normalizeVoiceMime(input.mimeType, ext);
  if (!isAllowedVoiceMime(input.mimeType) && mime === 'application/octet-stream') {
    return { ok: false, error: '지원하지 않는 오디오 형식입니다.' };
  }
  if (
    typeof input.durationSeconds === 'number' &&
    Number.isFinite(input.durationSeconds) &&
    input.durationSeconds > VOICE_REF_MAX_DURATION_SECONDS
  ) {
    return {
      ok: false,
      error: `참조 음성은 ${VOICE_REF_MAX_DURATION_SECONDS}초 이하로 등록해주세요. (CosyVoice는 긴 참조음보다 3~10초 클린 구간이 더 안정적입니다.)`,
    };
  }
  return { ok: true, ext, mime };
}

export function validateProfileFields(input: {
  name: string;
  promptText: string;
  defaultInstruction?: string | null;
  defaultSpeed?: number | null;
}): { ok: true; name: string; promptText: string; defaultInstruction: string | null; defaultSpeed: number } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: '캐릭터 이름을 입력해주세요.' };
  if (name.length > VOICE_NAME_MAX_CHARS) {
    return { ok: false, error: `캐릭터 이름은 ${VOICE_NAME_MAX_CHARS}자 이하여야 합니다.` };
  }
  const promptText = input.promptText.trim();
  if (!promptText) return { ok: false, error: '참조 음성의 실제 대사를 입력해주세요.' };
  if (promptText.length > VOICE_PROMPT_TEXT_MAX_CHARS) {
    return { ok: false, error: `참조 음성 대사는 ${VOICE_PROMPT_TEXT_MAX_CHARS}자 이하여야 합니다.` };
  }
  const instructionRaw = (input.defaultInstruction ?? '').trim();
  if (instructionRaw.length > VOICE_INSTRUCTION_MAX_CHARS) {
    return { ok: false, error: `연기 지시는 ${VOICE_INSTRUCTION_MAX_CHARS}자 이하여야 합니다.` };
  }
  const speed =
    typeof input.defaultSpeed === 'number' && Number.isFinite(input.defaultSpeed)
      ? input.defaultSpeed
      : VOICE_SPEED_DEFAULT;
  if (speed < VOICE_SPEED_MIN || speed > VOICE_SPEED_MAX) {
    return { ok: false, error: `속도는 ${VOICE_SPEED_MIN}~${VOICE_SPEED_MAX} 사이여야 합니다.` };
  }
  return {
    ok: true,
    name,
    promptText,
    defaultInstruction: instructionRaw || null,
    defaultSpeed: speed,
  };
}

export function validateGenerateFields(input: {
  text: string;
  instruction?: string | null;
  speed?: number | null;
}): { ok: true; text: string; instruction: string | null; speed: number } | { ok: false; error: string } {
  const text = input.text.trim();
  if (!text) return { ok: false, error: '독백 텍스트를 입력해주세요.' };
  if (text.length > VOICE_TEXT_MAX_CHARS) {
    return { ok: false, error: `독백 텍스트는 ${VOICE_TEXT_MAX_CHARS}자 이하여야 합니다.` };
  }
  const instructionRaw = (input.instruction ?? '').trim();
  if (instructionRaw.length > VOICE_INSTRUCTION_MAX_CHARS) {
    return { ok: false, error: `연기 지시는 ${VOICE_INSTRUCTION_MAX_CHARS}자 이하여야 합니다.` };
  }
  const speed =
    typeof input.speed === 'number' && Number.isFinite(input.speed) ? input.speed : VOICE_SPEED_DEFAULT;
  if (speed < VOICE_SPEED_MIN || speed > VOICE_SPEED_MAX) {
    return { ok: false, error: `속도는 ${VOICE_SPEED_MIN}~${VOICE_SPEED_MAX} 사이여야 합니다.` };
  }
  return {
    ok: true,
    text,
    instruction: instructionRaw || null,
    speed,
  };
}
