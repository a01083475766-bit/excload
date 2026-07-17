import { describe, it, expect } from 'vitest';
import {
  buildConnectionHelp,
  configErrorScopeFromCode,
  getProviderConnectionHelp,
  PROVIDER_CONNECTION_HELP,
} from './provider-connection-help';
import type { HealthStatus } from './types';
import type { OrderIntegrationMallId } from '@/app/lib/order-integration/malls';

const ALL_STATUSES: HealthStatus[] = [
  'HEALTHY',
  'AUTH_REQUIRED',
  'IP_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'RATE_LIMITED',
  'TEMPORARY_ERROR',
  'ACCOUNT_CONFIG_ERROR',
  'REQUEST_INVALID',
  'UNKNOWN',
];

// 사용자 화면에 절대 노출되면 안 되는 내부 용어/코드.
const FORBIDDEN = [
  'AUTH_REQUIRED',
  'IP_NOT_ALLOWED',
  'PERMISSION_DENIED',
  'APPROVAL_REQUIRED',
  'RATE_LIMITED',
  'TEMPORARY_ERROR',
  'ACCOUNT_CONFIG_ERROR',
  'REQUEST_INVALID',
  'UNKNOWN',
  'healthStatus',
  'rawMessage',
  'GW.',
  'invalid_client',
  'VERIFIED',
  'PROVISIONAL',
  'DISABLED',
];

describe('buildConnectionHelp - 스마트스토어', () => {
  it('AUTH_REQUIRED는 네이버 센터 확인 + 엑클로드 수정 경로를 함께 안내한다', () => {
    const help = buildConnectionHelp({ mallId: 'smartstore', status: 'AUTH_REQUIRED' });
    expect(help).not.toBeNull();
    expect(help!.title).toBe('네이버 연결 정보 확인 필요');
    expect(help!.description).toContain('커머스API센터');
    expect(help!.description).toContain('엑클로드 연동 설정');
    expect(help!.checks).toContain('애플리케이션 사용 중·일시중단 상태');
    expect(help!.checks).toContain('애플리케이션 시크릿');
    expect(help!.center).toEqual({
      label: '네이버 커머스API센터',
      url: 'https://apicenter.commerce.naver.com',
    });
    expect(help!.settingsUrl).toBe('/order/integration/smartstore');
    expect(help!.showSettings).toBe(true);
    expect(help!.showRecheck).toBe(true);
    expect(help!.tone).toBe('error');
  });

  it('실제 원인을 단정하는 문구(재인증 필요/시크릿이 틀렸습니다)를 쓰지 않는다', () => {
    const help = buildConnectionHelp({ mallId: 'smartstore', status: 'AUTH_REQUIRED' });
    const text = `${help!.title} ${help!.description}`;
    expect(text).not.toContain('재인증 필요');
    expect(text).not.toContain('틀렸');
  });

  it('IP 오류는 인증 오류로 표시되지 않는다', () => {
    const help = buildConnectionHelp({ mallId: 'smartstore', status: 'IP_NOT_ALLOWED' });
    expect(help!.title).toContain('IP 등록');
    expect(help!.description).toContain('IP');
    expect(help!.checks).toEqual(['API 호출 IP에 엑클로드 IP 등록']);
  });

  it('권한 오류는 권한 확인만 안내한다', () => {
    const help = buildConnectionHelp({ mallId: 'smartstore', status: 'PERMISSION_DENIED' });
    expect(help!.title).toContain('권한');
    expect(help!.checks).toEqual(['주문 관련 API 권한 선택']);
  });

  it('승인·중단 오류는 앱·서비스 상태 확인을 안내한다', () => {
    const help = buildConnectionHelp({ mallId: 'smartstore', status: 'APPROVAL_REQUIRED' });
    expect(help!.title).toContain('앱·서비스 상태');
    expect(help!.tone).toBe('warn');
  });
});

describe('buildConnectionHelp - SSG 복합 원인', () => {
  it('AUTH_REQUIRED 안내가 인증과 IP를 함께 확인하도록 유도한다', () => {
    const help = buildConnectionHelp({ mallId: 'ssg', status: 'AUTH_REQUIRED' });
    expect(help!.title).toBe('SSG 연결 정보 확인 필요');
    expect(help!.description).toContain('인증키');
    expect(help!.description).toContain('IP');
  });
});

describe('buildConnectionHelp - 관리센터 URL', () => {
  it('공식 URL이 없는 샵바이는 관리센터 버튼을 만들지 않는다', () => {
    const help = buildConnectionHelp({ mallId: 'shopby', status: 'AUTH_REQUIRED' });
    expect(help!.center).toBeUndefined();
    expect(help!.showSettings).toBe(true);
    expect(help!.showRecheck).toBe(true);
  });

  it('URL이 있는 몰은 관리센터 라벨/주소를 제공한다', () => {
    expect(buildConnectionHelp({ mallId: 'coupang', status: 'AUTH_REQUIRED' })!.center?.url).toBe(
      'https://wing.coupang.com',
    );
    expect(buildConnectionHelp({ mallId: 'makeshop', status: 'AUTH_REQUIRED' })!.center?.label).toBe(
      '메이크샵 개발자센터',
    );
  });
});

describe('configErrorScopeFromCode', () => {
  it('서버/프록시 코드는 server, 그 외는 account로 본다', () => {
    expect(configErrorScopeFromCode('PROXY_NOT_CONFIGURED')).toBe('server');
    expect(configErrorScopeFromCode('PARTNER_KEY_MISSING')).toBe('server');
    expect(configErrorScopeFromCode('CREDENTIALS_MISSING')).toBe('account');
    expect(configErrorScopeFromCode(null)).toBe('account');
    expect(configErrorScopeFromCode('SOMETHING_SERVER_SIDE')).toBe('server');
  });
});

describe('buildConnectionHelp - 설정 오류(사용자/서버 구분)', () => {
  it('서버 설정 오류는 서버 안내를 쓰고 연동 정보 수정 버튼을 숨긴다', () => {
    const help = buildConnectionHelp({
      mallId: 'godomall',
      status: 'ACCOUNT_CONFIG_ERROR',
      configErrorScope: 'server',
    });
    expect(help!.description).toContain('엑클로드 연결 설정');
    expect(help!.showSettings).toBe(false);
    expect(help!.center).toBeUndefined();
  });

  it('같은 몰이라도 사용자 오류(account)면 연동 설정 확인을 안내한다', () => {
    const help = buildConnectionHelp({
      mallId: 'godomall',
      status: 'ACCOUNT_CONFIG_ERROR',
      configErrorScope: 'account',
    });
    expect(help!.description).toContain('연동 설정을 확인');
    expect(help!.showSettings).toBe(true);
  });

  it('scope가 없으면 사용자 수정 가능으로 보수적으로 안내한다', () => {
    const help = buildConnectionHelp({ mallId: 'coupang', status: 'ACCOUNT_CONFIG_ERROR' });
    expect(help!.description).toContain('연동 설정을 확인');
    expect(help!.showSettings).toBe(true);
  });
});

describe('buildConnectionHelp - 중립/정상', () => {
  it('HEALTHY와 REQUEST_INVALID는 상세 안내를 만들지 않는다', () => {
    expect(buildConnectionHelp({ mallId: 'smartstore', status: 'HEALTHY' })).toBeNull();
    expect(buildConnectionHelp({ mallId: 'smartstore', status: 'REQUEST_INVALID' })).toBeNull();
  });

  it('일시적 상태는 관리센터/설정 이동 없이 다시 확인만 제공한다', () => {
    for (const status of ['RATE_LIMITED', 'TEMPORARY_ERROR'] as const) {
      const help = buildConnectionHelp({ mallId: 'coupang', status });
      expect(help!.center).toBeUndefined();
      expect(help!.showSettings).toBe(false);
      expect(help!.showRecheck).toBe(true);
      expect(help!.tone).toBe('warn');
    }
  });

  it('원인 불명(UNKNOWN)은 단정하지 않고 연결 정보 확인 필요로 안내한다', () => {
    const help = buildConnectionHelp({ mallId: 'lotteon', status: 'UNKNOWN' });
    expect(help!.title).toContain('연결 정보 확인 필요');
    expect(help!.tone).toBe('warn');
  });
});

describe('buildConnectionHelp - 내부 코드/민감정보 미노출', () => {
  const mallIds = Object.keys(PROVIDER_CONNECTION_HELP) as OrderIntegrationMallId[];
  it('모든 몰/상태 조합의 사용자 문구에 내부 용어가 없다', () => {
    for (const mallId of mallIds) {
      for (const status of ALL_STATUSES) {
        for (const scope of ['account', 'server', null] as const) {
          const help = buildConnectionHelp({ mallId, status, configErrorScope: scope });
          if (!help) continue;
          const text = [help.title, help.description, ...help.checks, help.center?.label ?? ''].join(' ');
          for (const term of FORBIDDEN) {
            expect(text.includes(term), `${mallId}/${status} → "${term}"`).toBe(false);
          }
        }
      }
    }
  });
});

describe('provider 메타데이터', () => {
  it('CJ온스타일은 상세 안내 메타데이터를 두지 않는다(PROVISIONAL)', () => {
    expect(getProviderConnectionHelp('cjonstyle')).toBeUndefined();
  });

  it('등록되지 않은 몰은 일반 문구로 폴백한다', () => {
    const help = buildConnectionHelp({ mallId: 'cjonstyle', status: 'AUTH_REQUIRED' });
    expect(help!.title).toBe('쇼핑몰 연결 정보 확인 필요');
    expect(help!.center).toBeUndefined();
    expect(help!.settingsUrl).toBeUndefined();
    expect(help!.showSettings).toBe(false);
  });

  it('등록된 모든 몰의 settingsUrl이 실제 라우트(mallId) 규칙과 일치한다', () => {
    for (const [mallId, help] of Object.entries(PROVIDER_CONNECTION_HELP)) {
      expect(help!.settingsUrl).toBe(`/order/integration/${mallId}`);
      expect(help!.mallId).toBe(mallId);
    }
  });
});
