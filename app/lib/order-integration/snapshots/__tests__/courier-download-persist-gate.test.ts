import { describe, expect, it } from 'vitest';
import { evaluateCourierDownloadPersistGate } from '@/app/lib/order-integration/snapshots/courier-download-persist-gate';

describe('evaluateCourierDownloadPersistGate', () => {
  it('allows download when persist was not attempted (flag off)', () => {
    const gate = evaluateCourierDownloadPersistGate({
      httpOk: true,
      body: { success: true, attempted: false, savedOrderCount: 0, groupResults: [] },
    });
    expect(gate).toEqual({ ok: true, attempted: false, notice: '' });
  });

  it('blocks download on HTTP failure', () => {
    const gate = evaluateCourierDownloadPersistGate({
      httpOk: false,
      body: { error: '연동 계정을 확인할 수 없습니다.' },
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.message).toContain('연동 계정');
    }
  });

  it('blocks download when any group failed under attempted=true', () => {
    const gate = evaluateCourierDownloadPersistGate({
      httpOk: true,
      body: {
        success: true,
        attempted: true,
        savedOrderCount: 0,
        groupResults: [
          { persisted: true, orderCount: 1 },
          { persisted: false, reason: 'persist_failed' },
        ],
      },
    });
    expect(gate.ok).toBe(false);
  });

  it('allows download when all groups persisted (including dedupe-only)', () => {
    const gate = evaluateCourierDownloadPersistGate({
      httpOk: true,
      body: {
        success: true,
        attempted: true,
        savedOrderCount: 0,
        groupResults: [{ persisted: true, orderCount: 0 }],
      },
    });
    expect(gate.ok).toBe(true);
    if (gate.ok && gate.attempted) {
      expect(gate.notice).toContain('이미 저장');
    }
  });
});
