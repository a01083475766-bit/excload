type VoiceStorageConfig = {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
};

export type VoiceSignedUpload = {
  objectKey: string;
  signedUploadUrl: string;
  token: string;
};

export type VoiceSignedDownload = {
  objectKey: string;
  signedDownloadUrl: string;
  expiresInSeconds: number;
};

function getVoiceStorageConfig(): VoiceStorageConfig {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.VOICE_STORAGE_BUCKET?.trim();

  if (!baseUrl || !serviceRoleKey || !bucket) {
    throw new Error('음성 파일 저장소가 설정되지 않았습니다.');
  }

  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('음성 파일 저장소 주소가 안전하지 않습니다.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(bucket)) {
    throw new Error('음성 파일 bucket 설정이 올바르지 않습니다.');
  }

  return { baseUrl: url.toString().replace(/\/+$/, ''), serviceRoleKey, bucket };
}

export function isVoiceStorageConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.VOICE_STORAGE_BUCKET?.trim(),
  );
}

function encodeObjectKey(objectKey: string): string {
  if (!objectKey.startsWith('voice/') || objectKey.includes('..')) {
    throw new Error('음성 파일 object key가 올바르지 않습니다.');
  }
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export function buildVoiceReferenceObjectKey(profileId: string, ext: string): string {
  const safeExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return `voice/refs/${profileId}/reference${safeExt}`;
}

export function buildVoiceOutputObjectKey(profileId: string, generationId: string): string {
  return `voice/outputs/${profileId}/${generationId}.wav`;
}

function toAbsoluteStorageUrl(baseUrl: string, relativeOrAbsolute: string): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute;
  }
  const path = relativeOrAbsolute.startsWith('/')
    ? relativeOrAbsolute
    : `/${relativeOrAbsolute}`;
  return `${baseUrl}/storage/v1${path}`;
}

/** Short-lived object-scoped upload URL. Never exposes service-role key. */
export async function createVoiceSignedUploadUrl(objectKey: string): Promise<VoiceSignedUpload> {
  const config = getVoiceStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceRoleKey),
        'Content-Type': 'application/json',
      },
      body: '{}',
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('음성 업로드 URL 발급에 실패했습니다.');
  }

  const json = (await response.json()) as { url?: string; token?: string };
  if (!json.url || !json.token) {
    throw new Error('음성 업로드 URL 응답이 올바르지 않습니다.');
  }

  return {
    objectKey,
    signedUploadUrl: toAbsoluteStorageUrl(config.baseUrl, json.url),
    token: json.token,
  };
}

/** Short-lived signed download URL for private objects. */
export async function createVoiceSignedDownloadUrl(
  objectKey: string,
  expiresInSeconds: number,
): Promise<VoiceSignedDownload> {
  const config = getVoiceStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceRoleKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('음성 다운로드 URL 발급에 실패했습니다.');
  }

  const json = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const relative = json.signedURL ?? json.signedUrl;
  if (!relative) {
    throw new Error('음성 다운로드 URL 응답이 올바르지 않습니다.');
  }

  return {
    objectKey,
    signedDownloadUrl: toAbsoluteStorageUrl(config.baseUrl, relative),
    expiresInSeconds,
  };
}

export async function voiceObjectExists(objectKey: string): Promise<boolean> {
  const config = getVoiceStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: 'HEAD',
      headers: authHeaders(config.serviceRoleKey),
      cache: 'no-store',
    },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    // Some Storage deployments do not support HEAD — fall back to ranged GET.
    const getResponse = await fetch(
      `${config.baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
      {
        method: 'GET',
        headers: {
          ...authHeaders(config.serviceRoleKey),
          Range: 'bytes=0-0',
        },
        cache: 'no-store',
      },
    );
    if (getResponse.status === 404) return false;
    if (!getResponse.ok && getResponse.status !== 206) {
      throw new Error('음성 파일 존재 확인에 실패했습니다.');
    }
    return true;
  }
  return true;
}

export async function deleteVoiceObject(objectKey: string): Promise<void> {
  const config = getVoiceStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(config.serviceRoleKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [objectKey] }),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error('음성 파일 저장소 정리에 실패했습니다.');
  }
}
