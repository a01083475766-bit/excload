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
  referenceDownloadUrl: string;
  referenceFilename: string;
  outputUploadUrl: string;
  outputObjectKey: string;
  promptText: string;
  text: string;
  instruction?: string | null;
  speed: number;
};

export type VoiceGenerateSuccess = {
  ok: true;
  outputStoragePath: string;
};

export type VoiceGenerateFailure = {
  ok: false;
  error: string;
  status: number;
};

/**
 * Asks GPU worker to download reference + upload WAV via short-lived signed URLs.
 * No audio binary passes through the Vercel function body.
 */
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_download_url: input.referenceDownloadUrl,
        reference_filename: input.referenceFilename,
        output_upload_url: input.outputUploadUrl,
        output_object_key: input.outputObjectKey,
        prompt_text: input.promptText,
        text: input.text,
        instruction: input.instruction || null,
        speed: input.speed,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') ?? '';
    let json: { error?: string; output_storage_path?: string; ok?: boolean } = {};
    if (contentType.includes('application/json')) {
      try {
        json = (await response.json()) as typeof json;
      } catch {
        json = {};
      }
    }

    if (!response.ok) {
      let message = '음성 생성 중 오류가 발생했습니다.';
      if (typeof json.error === 'string' && json.error.trim()) {
        message = json.error.trim().slice(0, 300);
      }
      if (response.status === 401) {
        message = '음성 엔진 인증에 실패했습니다.';
      } else if (response.status === 503) {
        message = '음성 엔진을 사용할 수 없습니다.';
      }
      return { ok: false, error: message, status: response.status >= 400 ? response.status : 502 };
    }

    const outputPath =
      typeof json.output_storage_path === 'string' ? json.output_storage_path.trim() : '';
    if (!outputPath || outputPath !== input.outputObjectKey) {
      return {
        ok: false,
        error: '음성 엔진이 올바르지 않은 저장 경로를 반환했습니다.',
        status: 502,
      };
    }

    return { ok: true, outputStoragePath: outputPath };
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
