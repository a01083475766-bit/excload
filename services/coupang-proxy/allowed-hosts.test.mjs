import { describe, expect, it } from 'vitest';
import {
  assertUrlAllowed,
  getAllowedHostnames,
  INTEGRATION_PROXY_HOST_RULES,
  INTEGRATION_PROXY_SUFFIX_RULES,
  isHostAllowed,
  parseCafe24MallIdFromHostname,
} from './allowed-hosts.mjs';

describe('Lightsail allowed-hosts.mjs', () => {
  it('includes all 1-shot exact hosts', () => {
    expect(getAllowedHostnames().sort()).toEqual(
      [
        'api-gateway.coupang.com',
        'api.commerce.naver.com',
        'api.11st.co.kr',
        'sbadmin.sabangnet.co.kr',
        'openapi.lotteon.com',
        'eapi.ssgadm.com',
        'api.cjonstyle.com',
        'server-api.e-ncp.com',
        'openhub.godo.co.kr',
        'connect.makeshop.co.kr',
      ].sort(),
    );
  });

  it('does not include legacy api.cafe24.com', () => {
    expect(getAllowedHostnames()).not.toContain('api.cafe24.com');
  });

  it('allows cafe24 suffix host with valid mallId', () => {
    expect(isHostAllowed('abc123.cafe24api.com', 'https')).toBe(true);
    expect(parseCafe24MallIdFromHostname('abc123.cafe24api.com')).toBe('abc123');
    expect(assertUrlAllowed('https://abc123.cafe24api.com/api/v2/admin/orders').hostname).toBe(
      'abc123.cafe24api.com',
    );
  });

  it('blocks cafe24 SSRF edge cases', () => {
    const blocked = [
      'cafe24api.com',
      'abc.def.cafe24api.com',
      'cafe24api.com.evil.com',
      'evil-cafe24api.com',
    ];

    for (const hostname of blocked) {
      expect(isHostAllowed(hostname, 'https'), hostname).toBe(false);
      expect(parseCafe24MallIdFromHostname(hostname), hostname).toBeNull();
      expect(() => assertUrlAllowed(`https://${hostname}/`)).toThrow('domain not allowed');
    }

    expect(isHostAllowed('abc123.cafe24api.com', 'http')).toBe(false);
    expect(() => assertUrlAllowed('http://abc123.cafe24api.com/')).toThrow('domain not allowed');
  });

  it('allows https only for eleven', () => {
    expect(isHostAllowed('api.11st.co.kr', 'https')).toBe(true);
    expect(isHostAllowed('api.11st.co.kr', 'http')).toBe(false);
  });

  it('lists sabangnet as hub upstream only (not direct eleven host)', () => {
    const sabangnetRule = INTEGRATION_PROXY_HOST_RULES.find((r) => r.hostname === 'sbadmin.sabangnet.co.kr');
    expect(sabangnetRule?.malls).toEqual(['sabangnet']);
    expect(INTEGRATION_PROXY_HOST_RULES.some((r) => r.hostname === 'api.11st.co.kr' && r.malls.includes('eleven'))).toBe(
      true,
    );
  });

  it('tracks cafe24 suffix rule', () => {
    expect(INTEGRATION_PROXY_SUFFIX_RULES).toEqual([
      expect.objectContaining({ suffix: 'cafe24api.com', protocols: ['https'], malls: ['cafe24'] }),
    ]);
  });
});
