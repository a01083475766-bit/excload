import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/download/route';

describe('/api/download', () => {
  it('POST returns 410 Gone', async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.code).toBe('GONE');
  });

  it('GET returns 410 Gone', async () => {
    const res = await GET();
    expect(res.status).toBe(410);
  });
});
