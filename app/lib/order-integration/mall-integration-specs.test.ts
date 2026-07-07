import { describe, expect, it } from 'vitest';
import {
  CHANNEL_INTEGRATION_SPECS,
  detectMarketplaceSourceConflicts,
  getAllPlannedProxyDomains,
  getChannelIntegrationSpec,
  getDirectApiChannels,
  getExcelUploadChannels,
  getHubApiChannels,
  getIntegrationProxyAllowedHostnames,
  validateSingleSourcePerMarketplace,
} from '@/app/lib/order-integration/mall-integration-specs';
import {
  INTEGRATION_PROXY_HOST_RULES,
  INTEGRATION_PROXY_SUFFIX_RULES,
} from '../../../services/coupang-proxy/allowed-hosts.mjs';

const LIGHTSAIL_ONE_SHOT_EXACT_HOSTS = [
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
] as const;

describe('proxy whitelist sync (TS registry ↔ Lightsail allowed-hosts.mjs)', () => {
  it('keeps Lightsail exact host list at 1-shot deploy target', () => {
    const mjsHosts = INTEGRATION_PROXY_HOST_RULES.map((r) => r.hostname).sort();
    expect(mjsHosts).toEqual([...LIGHTSAIL_ONE_SHOT_EXACT_HOSTS].sort());
  });

  it('includes every Vercel deployed exact hostname in Lightsail mjs', () => {
    const mjsHosts = new Set(INTEGRATION_PROXY_HOST_RULES.map((r) => r.hostname));
    for (const hostname of getIntegrationProxyAllowedHostnames()) {
      expect(mjsHosts.has(hostname)).toBe(true);
    }
  });

  it('does not include legacy api.cafe24.com in Lightsail mjs', () => {
    const mjsHosts = INTEGRATION_PROXY_HOST_RULES.map((r) => r.hostname);
    expect(mjsHosts).not.toContain('api.cafe24.com');
  });

  it('tracks cafe24 suffix rule in registry and Lightsail mjs', () => {
    const spec = getChannelIntegrationSpec('cafe24');
    expect(spec?.proxyDomains.some((d) => d.hostname === '*.cafe24api.com' && d.matchKind === 'suffix')).toBe(
      true,
    );
    expect(INTEGRATION_PROXY_SUFFIX_RULES.some((r) => r.suffix === 'cafe24api.com')).toBe(true);
  });
});

describe('channel integration registry', () => {
  it('registers required direct_api channels', () => {
    const codes = getDirectApiChannels().map((c) => c.channelCode);
    expect(codes).toEqual(
      expect.arrayContaining([
        'coupang',
        'smartstore',
        'eleven',
        'cafe24',
        'lotteon',
        'ssg',
        'cjonstyle',
        'godomall',
        'shopby',
        'makeshop',
      ]),
    );
  });

  it('registers hub_api channels', () => {
    const codes = getHubApiChannels().map((c) => c.channelCode);
    expect(codes).toEqual(
      expect.arrayContaining([
        'playauto',
        'sabangnet',
        'shoplinker',
        'easyadmin',
        'shoppling',
        'sellmate',
        'sellric',
        'sellpick',
        'easywinner',
      ]),
    );
  });

  it('allows excel_upload channels', () => {
    expect(getExcelUploadChannels().length).toBeGreaterThanOrEqual(1);
    expect(getExcelUploadChannels().every((c) => c.integrationType === 'excel_upload')).toBe(
      true,
    );
  });

  it('marks restricted channels', () => {
    expect(getChannelIntegrationSpec('gmarket')?.phase).toBe('partnership_required');
    expect(getChannelIntegrationSpec('kakao_talkstore')?.phase).toBe('partnership_required');
  });

  it('has unique channelCode values', () => {
    const codes = CHANNEL_INTEGRATION_SPECS.map((c) => c.channelCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('tracks lotteon host in Vercel whitelist before Lightsail 1-shot deploy', () => {
    expect(getIntegrationProxyAllowedHostnames()).toContain('openapi.lotteon.com');
  });

  it('tracks ssg host in Vercel whitelist before Lightsail 1-shot deploy', () => {
    expect(getIntegrationProxyAllowedHostnames()).toContain('eapi.ssgadm.com');
  });

  it('tracks cjonstyle host in planned proxy domains before deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'api.cjonstyle.com')).toBe(true);
  });

  it('tracks shopby server-api host in planned proxy domains before deploy', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'server-api.e-ncp.com')).toBe(true);
  });

  it('tracks planned proxy domains beyond deployed whitelist', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'openhub.godo.co.kr')).toBe(true);
    expect(planned.some((d) => d.hostname === 'connect.makeshop.co.kr')).toBe(true);
  });
});

describe('marketplace source deduplication', () => {
  it('detects conflict when coupang direct and playauto hub are both active', () => {
    const conflicts = detectMarketplaceSourceConflicts(['coupang', 'playauto']);
    expect(conflicts.some((c) => c.marketplaceGroupId === 'coupang')).toBe(true);
  });

  it('passes when only one source per marketplace', () => {
    const result = validateSingleSourcePerMarketplace(['coupang', 'eleven']);
    expect(result.ok).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('ignores excel_upload for marketplace conflict rules', () => {
    const result = validateSingleSourcePerMarketplace(['coupang', 'excel_tmon']);
    expect(result.ok).toBe(true);
  });
});
