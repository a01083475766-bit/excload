export function safeRandomId(prefix = 'free-tool'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
      ? Array.from(crypto.getRandomValues(new Uint32Array(2)))
          .map((value) => value.toString(36))
          .join('')
      : Math.random().toString(36).slice(2);

  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta = '', data = ''] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

export function canvasToBlobWithFallback(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        try {
          resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('canvas_blob_failed'));
        }
      },
      type,
      quality,
    );
  });
}

export function decodeTextWithFallback(
  buffer: ArrayBuffer,
  encodings: string[],
  options?: TextDecoderOptions,
): string {
  let lastError: unknown = null;

  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding, options).decode(buffer);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('text_decode_failed');
}
