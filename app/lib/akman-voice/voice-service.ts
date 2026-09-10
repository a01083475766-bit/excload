import { VOICE_SERVICE_TIMEOUT_MS } from '@/app/lib/akman-voice/constants';

export type VoiceServiceStatus = {
  configured: boolean;
  url: string | null;
};

export function getVoiceServiceStatus(): VoiceServiceStatus {
  const url = process.env.VOICE_SERVICE_URL?.trim().replace(/\/+$/, '') || null;
  const secret = process.env.VOICE_SERVICE_SECRET?.trim() || null;
  return {
    configured: Boolean(url && secret),
    url,
  };
}

export type VoiceGenerateRequest = {
  referenceAudio: Buffer;
  referenceFilename: string;
  referenceMimeType: string;
  promptText: string;
  text: string;
  instruction?: string | null;
  speed: number;
};

export type VoiceGenerateSuccess = {
  ok: true;
  wavBytes: Buffer;
};

export type VoiceGenerateFailure = {
  ok: false;
  error: string;
  status: number;
};

export async function callVoiceWorkerGenerate(
  input: VoiceGenerateRequest,
): Promise<VoiceGenerateSuccess | VoiceGenerateFailure> {
  const url = process.env.VOICE_SERVICE_URL?.trim().replace(/\/+$/, '');
  const secret = process.env.VOICE_SERVICE_SECRET?.trim();

  if (!url || !secret) {
    return {
      ok: false,
      error: 'GPU 음성 엔진이 아직 설정되지 않았습니다.',
      status: 503,
    };
  }

  const form = new FormData();
  form.append(
    'reference_audio',
    new Blob([new Uint8Array(input.referenceAudio)], { type: input.referenceMimeType }),
    input.referenceFilename,
  );
  form.append('prompt_text', input.promptText);
  form.append('text', input.text);
  form.append('speed', String(input.speed));
  if (input.instruction) {
    form.append('instruction', input.instruction);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      body: form,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      let message = '음성 생성 중 오류가 발생했습니다.';
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          const json = (await response.json()) as { error?: string };
          if (typeof json.error === 'string' && json.error.trim()) {
            message = json.error.trim().slice(0, 300);
          }
        } catch {
          // ignore parse errors
        }
      }
      if (response.status === 401) {
        message = '음성 엔진 인증에 실패했습니다.';
      } else if (response.status === 503) {
        message = '음성 엔진을 사용할 수 없습니다.';
      }
      return { ok: false, error: message, status: response.status >= 400 ? response.status : 502 };
    }

    const arrayBuffer = await response.arrayBuffer();
    const wavBytes = Buffer.from(arrayBuffer);
    if (wavBytes.length < 44) {
      return { ok: false, error: '음성 엔진이 빈 결과를 반환했습니다.', status: 502 };
    }
    return { ok: true, wavBytes };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: '음성 생성 시간이 초과되었습니다.', status: 504 };
    }
    console.error('[akman-voice] worker request failed', error instanceof Error ? error.message : 'unknown');
    return { ok: false, error: '음성 엔진에 연결할 수 없습니다.', status: 503 };
  } finally {
    clearTimeout(timer);
  }
}
