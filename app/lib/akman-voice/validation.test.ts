import { describe, expect, it } from 'vitest';
import {
  tryReadWavDurationSeconds,
  validateGenerateFields,
  validateProfileFields,
  validateReferenceUpload,
} from '@/app/lib/akman-voice/validation';

function makeSilentWav(seconds: number, sampleRate = 16000): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

describe('akman-voice validation', () => {
  it('rejects reference audio longer than 30 seconds', () => {
    const result = validateReferenceUpload({
      originalName: 'a.wav',
      mimeType: 'audio/wav',
      sizeBytes: 1000,
      durationSeconds: 31,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/30초/);
  });

  it('accepts short wav upload', () => {
    const result = validateReferenceUpload({
      originalName: 'a.wav',
      mimeType: 'audio/wav',
      sizeBytes: 1000,
      durationSeconds: 8,
    });
    expect(result.ok).toBe(true);
  });

  it('reads wav duration from header', () => {
    const wav = makeSilentWav(2);
    const duration = tryReadWavDurationSeconds(wav);
    expect(duration).not.toBeNull();
    expect(duration!).toBeCloseTo(2, 1);
  });

  it('requires prompt text and name', () => {
    expect(validateProfileFields({ name: '', promptText: 'hi' }).ok).toBe(false);
    expect(validateProfileFields({ name: 'A', promptText: '' }).ok).toBe(false);
    expect(validateProfileFields({ name: 'A', promptText: '대사' }).ok).toBe(true);
  });

  it('validates generate text and speed', () => {
    expect(validateGenerateFields({ text: '', speed: 1 }).ok).toBe(false);
    expect(validateGenerateFields({ text: '독백', speed: 2 }).ok).toBe(false);
    expect(validateGenerateFields({ text: '독백', speed: 1 }).ok).toBe(true);
  });
});
