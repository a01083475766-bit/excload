import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAFE24_OAUTH_REDIRECT_URI,
  CAFE24_OAUTH_SCOPES,
} from '@/app/lib/cafe24/constants';

function findClientComponents(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return findClientComponents(fullPath);
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) return [];

    const source = readFileSync(fullPath, 'utf8');
    return /^\s*['"]use client['"];?/m.test(source) ? [fullPath] : [];
  });
}

describe('Cafe24 browser import boundary', () => {
  it('keeps the OAuth values in a browser-safe module', () => {
    expect(CAFE24_OAUTH_REDIRECT_URI).toBe(
      'https://www.excload.com/api/order/integration/cafe24/callback',
    );
    expect(CAFE24_OAUTH_SCOPES).toBe('mall.read_order mall.write_order mall.read_shipping');
  });

  it('does not import the server-heavy Cafe24 client from client components', () => {
    const appDirectory = join(process.cwd(), 'app');
    const offenders = findClientComponents(appDirectory)
      .filter((file) => readFileSync(file, 'utf8').includes('@/app/lib/cafe24/client'))
      .map((file) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
