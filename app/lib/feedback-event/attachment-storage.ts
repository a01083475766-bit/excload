type FeedbackStorageConfig = {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
};

export type DownloadedFeedbackAttachment = {
  body: ReadableStream<Uint8Array> | ArrayBuffer;
  contentType: string;
  contentLength: string | null;
};

function getFeedbackStorageConfig(): FeedbackStorageConfig {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.FEEDBACK_STORAGE_BUCKET?.trim();

  if (!baseUrl || !serviceRoleKey || !bucket) {
    throw new Error('피드백 첨부파일 저장소가 설정되지 않았습니다.');
  }

  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('피드백 첨부파일 저장소 주소가 안전하지 않습니다.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(bucket)) {
    throw new Error('피드백 첨부파일 bucket 설정이 올바르지 않습니다.');
  }

  return { baseUrl: url.toString().replace(/\/+$/, ''), serviceRoleKey, bucket };
}

function encodeObjectKey(objectKey: string): string {
  if (!objectKey.startsWith('feedback/') || objectKey.includes('..')) {
    throw new Error('첨부파일 object key가 올바르지 않습니다.');
  }
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export async function uploadFeedbackAttachmentObject(input: {
  objectKey: string;
  bytes: Buffer;
  contentType: string;
}): Promise<void> {
  const config = getFeedbackStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectKey(input.objectKey)}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceRoleKey),
        'Content-Type': input.contentType,
        'Cache-Control': 'no-store',
        'x-upsert': 'false',
      },
      body: input.bytes,
    },
  );

  if (!response.ok) {
    throw new Error('첨부파일 저장소 업로드에 실패했습니다.');
  }
}

export async function downloadFeedbackAttachmentObject(
  objectKey: string,
): Promise<DownloadedFeedbackAttachment | null> {
  const config = getFeedbackStorageConfig();
  const response = await fetch(
    `${config.baseUrl}/storage/v1/object/authenticated/${encodeURIComponent(config.bucket)}/${encodeObjectKey(objectKey)}`,
    {
      method: 'GET',
      headers: authHeaders(config.serviceRoleKey),
      cache: 'no-store',
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('첨부파일 저장소 조회에 실패했습니다.');

  return {
    body: response.body ?? (await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    contentLength: response.headers.get('content-length'),
  };
}

export async function deleteFeedbackAttachmentObject(objectKey: string): Promise<void> {
  const config = getFeedbackStorageConfig();
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
    throw new Error('첨부파일 저장소 정리에 실패했습니다.');
  }
}
