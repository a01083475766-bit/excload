import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
export const INTEGRATION_ENCRYPTION_KEY_VERSION = 1;

export type EncryptedField = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function getEncryptionKey(): Buffer {
  const raw = process.env.EXCLOAD_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('EXCLOAD_INTEGRATION_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('EXCLOAD_INTEGRATION_ENCRYPTION_KEY는 base64로 인코딩된 32바이트 키여야 합니다.');
  }

  return key;
}

export function encryptIntegrationSecret(plaintext: string): EncryptedField {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: INTEGRATION_ENCRYPTION_KEY_VERSION,
  };
}

export function decryptIntegrationSecret(payload: EncryptedField): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isIntegrationEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
