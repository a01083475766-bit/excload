import { describe, expect, it } from 'vitest';
import {
  CHANNEL_INTEGRATION_SPECS,
  detectMarketplaceSourceConflicts,
  getAllPlannedProxyDomains,
  getChannelIntegrationSpec,
  getDirectApiChannels,
  getDeferredHubChannels,
  getExcelUploadChannels,
  getHubApiChannels,
  getLiveDirectApiChannels,
  getPartnershipDirectChannels,
  getPlannedDirectApiChannels,
  getPriorityHubChannels,
  getIntegrationProxyAllowedHostnames,
  getMarketplaceGroupsForChannel,
  validateSingleSourcePerMarketplace,
} from '@/app/lib/order-integration/mall-integration-specs';
import {
  INTEGRATION_PROXY_HOST_RULES,
  INTEGRATION_PROXY_SUFFIX_RULES,
} from '../../../services/coupang-proxy/allowed-hosts.mjs';

const INTEGRATION_TYPES = ['direct_api', 'hub_api', 'excel_upload'] as const;

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

const HUB_UPSTREAM_HOST = 'sbadmin.sabangnet.co.kr';

function getDirectExactUpstreamHostnames(): Set<string> {
  const hosts = new Set<string>();
  for (const spec of getDirectApiChannels()) {
    for (const domain of spec.proxyDomains) {
      if ((domain.matchKind ?? 'exact') !== 'exact') continue;
      if (!domain.hostname.startsWith('*.')) {
        hosts.add(domain.hostname);
      }
    }
  }
  return hosts;
}

function getSsotExactUpstreamHostnames(): Set<string> {
  const hosts = new Set<string>();
  for (const spec of CHANNEL_INTEGRATION_SPECS) {
    if (spec.integrationType === 'excel_upload') continue;
    for (const domain of spec.proxyDomains) {
      if ((domain.matchKind ?? 'exact') !== 'exact') continue;
      if (!domain.hostname.startsWith('*.')) {
        hosts.add(domain.hostname);
      }
    }
  }
  return hosts;
}

describe('integrationType policy (SSOT registry)', () => {
  it('assigns every channel exactly one of direct_api / hub_api / excel_upload', () => {
    for (const spec of CHANNEL_INTEGRATION_SPECS) {
      expect(INTEGRATION_TYPES, spec.channelCode).toContain(spec.integrationType);
    }
  });

  it('requires marketplaceGroupId on every direct_api channel', () => {
    for (const spec of getDirectApiChannels()) {
      expect(spec.marketplaceGroupId, spec.channelCode).toBeTruthy();
    }
  });

  it('requires hubCoversMarketplaceGroups on every hub_api channel', () => {
    for (const spec of getHubApiChannels()) {
      expect(spec.hubCoversMarketplaceGroups?.length, spec.channelCode).toBeGreaterThan(0);
    }
  });

  it('requires hubPriority on every hub_api channel', () => {
    for (const spec of getHubApiChannels()) {
      expect(['priority_hub', 'deferred'], spec.channelCode).toContain(spec.hubPriority);
    }
  });

  it('keeps exactly 3 priority_hub candidates', () => {
    expect(getPriorityHubChannels().map((c) => c.channelCode).sort()).toEqual(
      ['easyadmin', 'playauto', 'sabangnet'].sort(),
    );
  });

  it('defers non-priority hubs to backlog', () => {
    const deferred = getDeferredHubChannels().map((c) => c.channelCode).sort();
    expect(deferred).toEqual(
      ['easywinner', 'sellmate', 'sellpick', 'sellric', 'shoplinker', 'shoppling'].sort(),
    );
    for (const spec of getDeferredHubChannels()) {
      expect(spec.phase).toBe('backlog');
      expect(spec.hubPriority).toBe('deferred');
    }
  });

  it('does not put direct mall upstream hosts in hub_api proxyDomains', () => {
    const directHosts = getDirectExactUpstreamHostnames();
    for (const spec of getHubApiChannels()) {
      const overlapping = spec.proxyDomains
        .filter((d) => (d.matchKind ?? 'exact') === 'exact')
        .map((d) => d.hostname)
        .filter((h) => directHosts.has(h));
      expect(overlapping, spec.channelCode).toEqual([]);
    }
  });
});

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

  it('keeps every Lightsail exact host in SSOT proxyDomains (upstream only)', () => {
    const ssotHosts = getSsotExactUpstreamHostnames();
    for (const rule of INTEGRATION_PROXY_HOST_RULES) {
      expect(ssotHosts.has(rule.hostname), rule.hostname).toBe(true);
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

  it('allows sabangnet hub upstream host without implying full hub rollout', () => {
    const sabangnet = getChannelIntegrationSpec('sabangnet');
    expect(sabangnet?.integrationType).toBe('hub_api');
    expect(sabangnet?.hubPriority).toBe('priority_hub');
    expect(sabangnet?.phase).toBe('planned');
    expect(INTEGRATION_PROXY_HOST_RULES.some((r) => r.hostname === HUB_UPSTREAM_HOST)).toBe(true);
    expect(getHubApiChannels().find((h) => h.channelCode === 'playauto')?.proxyDomains).toHaveLength(0);
    expect(getDeferredHubChannels().some((h) => h.channelCode === 'shoplinker')).toBe(true);
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

  it('registers zigzag and shopify as planned direct_api', () => {
    expect(getChannelIntegrationSpec('zigzag')).toMatchObject({
      integrationType: 'direct_api',
      phase: 'planned',
      marketplaceGroupId: 'zigzag',
    });
    expect(getChannelIntegrationSpec('shopify')).toMatchObject({
      integrationType: 'direct_api',
      phase: 'planned',
      marketplaceGroupId: 'shopify',
    });
  });

  it('keeps gmarket as single ESM channel without auction channelCode', () => {
    const codes = CHANNEL_INTEGRATION_SPECS.map((c) => c.channelCode);
    expect(codes).toContain('gmarket');
    expect(codes).not.toContain('auction');
    expect(getChannelIntegrationSpec('gmarket')?.marketplaceGroupId).toBe('gmarket');
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
    expect(planned.some((d) => d.hostname === 'sa2.esmplus.com')).toBe(true);
    expect(planned.some((d) => d.hostname === 'zigzag.kr')).toBe(true);
  });

  it('does not mix planned proxy hosts into deployed allowed-hostnames', () => {
    const deployed = getIntegrationProxyAllowedHostnames();
    expect(deployed).not.toContain('sa2.esmplus.com');
    expect(deployed).not.toContain('zigzag.kr');
    expect(deployed).not.toContain('kapi.kakao.com');
    expect(deployed).not.toContain('*.myshopify.com');
  });
});

describe('direct channel phase helpers', () => {
  const LIVE_DIRECT_CODES = [
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
  ] as const;

  it('getLiveDirectApiChannels returns only live/beta operational channels', () => {
    const codes = getLiveDirectApiChannels().map((c) => c.channelCode).sort();
    expect(codes).toEqual([...LIVE_DIRECT_CODES].sort());
    expect(codes).not.toContain('gmarket');
    expect(codes).not.toContain('zigzag');
    expect(codes).not.toContain('shopify');
  });

  it('getPlannedDirectApiChannels returns zigzag and shopify only', () => {
    expect(getPlannedDirectApiChannels().map((c) => c.channelCode).sort()).toEqual(
      ['shopify', 'zigzag'].sort(),
    );
  });

  it('getPartnershipDirectChannels includes gmarket and kakao_talkstore', () => {
    const codes = getPartnershipDirectChannels().map((c) => c.channelCode).sort();
    expect(codes).toEqual(
      expect.arrayContaining(['ably', 'domeggook', 'gmarket', 'kakao_talkstore', 'musinsa', 'tenbyten']),
    );
  });

  it('partitions live, planned, and partnership direct channels without overlap', () => {
    const live = new Set(getLiveDirectApiChannels().map((c) => c.channelCode));
    const planned = new Set(getPlannedDirectApiChannels().map((c) => c.channelCode));
    const partnership = new Set(getPartnershipDirectChannels().map((c) => c.channelCode));
    for (const code of live) {
      expect(planned.has(code)).toBe(false);
      expect(partnership.has(code)).toBe(false);
    }
    for (const code of planned) {
      expect(partnership.has(code)).toBe(false);
    }
  });
});

describe('marketplace source deduplication', () => {
  it('detects conflict when coupang direct and playauto hub are both active', () => {
    const conflicts = detectMarketplaceSourceConflicts(['coupang', 'playauto']);
    expect(conflicts.some((c) => c.marketplaceGroupId === 'coupang')).toBe(true);
  });

  it('detects conflict when eleven direct and sabangnet hub are both active', () => {
    const conflicts = detectMarketplaceSourceConflicts(['eleven', 'sabangnet']);
    expect(conflicts.some((c) => c.marketplaceGroupId === 'eleven')).toBe(true);
  });

  it('passes when only one source per marketplace', () => {
    const result = validateSingleSourcePerMarketplace(['coupang', 'eleven']);
    expect(result.ok).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('does not conflict excel_generic without marketplaceGroupId with direct channels', () => {
    expect(getMarketplaceGroupsForChannel('excel_generic')).toEqual([]);
    const result = validateSingleSourcePerMarketplace(['coupang', 'eleven', 'excel_generic']);
    expect(result.ok).toBe(true);
  });

  it('includes excel_upload with marketplaceGroupId in conflict policy scope', () => {
    expect(getMarketplaceGroupsForChannel('excel_tmon')).toEqual(['tmon']);
    expect(getMarketplaceGroupsForChannel('excel_wemakeprice')).toEqual(['wemakeprice']);
    // tmon·wemakeprice direct 채널 없음 — 단독 활성화는 허용
    expect(validateSingleSourcePerMarketplace(['excel_tmon', 'excel_wemakeprice']).ok).toBe(true);
  });
});
