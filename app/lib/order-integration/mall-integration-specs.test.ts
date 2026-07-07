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
import { INTEGRATION_PROXY_HOST_RULES } from '../../../services/coupang-proxy/allowed-hosts.mjs';

describe('proxy whitelist sync (TS registry ↔ Lightsail allowed-hosts.mjs)', () => {
  /** Vercel SSOT에만 있고 Lightsail 1회 배포 전까지 mjs에 없는 exact hostname */
  const pendingLightsailExactHosts = ['api.cafe24.com', 'openapi.lotteon.com'];

  it('keeps deployed exact hostname lists identical (suffix rules excluded until Lightsail 1-shot)', () => {
    const tsHosts = getIntegrationProxyAllowedHostnames()
      .filter((hostname) => !pendingLightsailExactHosts.includes(hostname))
      .sort();
    const mjsHosts = INTEGRATION_PROXY_HOST_RULES.map((r) => r.hostname)
      .filter((hostname) => !pendingLightsailExactHosts.includes(hostname))
      .sort();
    expect(mjsHosts).toEqual(tsHosts);
  });

  it('tracks cafe24 suffix rule in registry', () => {
    const spec = getChannelIntegrationSpec('cafe24');
    expect(spec?.proxyDomains.some((d) => d.hostname === '*.cafe24api.com' && d.matchKind === 'suffix')).toBe(
      true,
    );
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

  it('tracks planned proxy domains beyond deployed whitelist', () => {
    const planned = getAllPlannedProxyDomains();
    expect(planned.some((d) => d.hostname === 'openhub.godo.co.kr')).toBe(true);
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
