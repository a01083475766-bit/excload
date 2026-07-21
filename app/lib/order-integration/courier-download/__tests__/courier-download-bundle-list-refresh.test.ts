import { describe, expect, it } from 'vitest';

import {
  buildNextCourierDownloadBundleListRefreshSignal,
  resolveSelectedDownloadBundleId,
  shouldApplyCourierDownloadBundleListRefresh,
} from '@/app/lib/order-integration/courier-download/courier-download-bundle-list-refresh';

describe('shouldApplyCourierDownloadBundleListRefresh', () => {
  it('인증 최초 조회용: null/0 nonce는 재조회하지 않음', () => {
    expect(shouldApplyCourierDownloadBundleListRefresh(null, 0)).toBe(false);
    expect(shouldApplyCourierDownloadBundleListRefresh({ nonce: 0, selectBundleId: 'x' }, 0)).toBe(
      false,
    );
  });

  it('성공 신호 nonce가 이전과 다르면 재조회', () => {
    expect(
      shouldApplyCourierDownloadBundleListRefresh({ nonce: 1, selectBundleId: 'b1' }, 0),
    ).toBe(true);
  });

  it('같은 nonce는 중복 GET 방지', () => {
    expect(
      shouldApplyCourierDownloadBundleListRefresh({ nonce: 2, selectBundleId: 'b1' }, 2),
    ).toBe(false);
  });
});

describe('buildNextCourierDownloadBundleListRefreshSignal', () => {
  it('실제 Bundle 생성 성공 시 nonce 증가 + bundleId', () => {
    const next = buildNextCourierDownloadBundleListRefreshSignal({
      previous: { nonce: 1, selectBundleId: 'old' },
      createSucceeded: true,
      isExamplePreview: false,
      createdBundleId: '  new-bundle  ',
    });
    expect(next).toEqual({ nonce: 2, selectBundleId: 'new-bundle' });
  });

  it('예시 미리보기는 신호 없음', () => {
    expect(
      buildNextCourierDownloadBundleListRefreshSignal({
        previous: null,
        createSucceeded: true,
        isExamplePreview: true,
        createdBundleId: 'should-not-use',
      }),
    ).toBeNull();
  });

  it('생성 실패 시 신호 없음', () => {
    expect(
      buildNextCourierDownloadBundleListRefreshSignal({
        previous: null,
        createSucceeded: false,
        isExamplePreview: false,
        createdBundleId: 'x',
      }),
    ).toBeNull();
  });

  it('성공이어도 bundleId 없으면 신호 없음(가짜 선택 방지)', () => {
    expect(
      buildNextCourierDownloadBundleListRefreshSignal({
        previous: null,
        createSucceeded: true,
        isExamplePreview: false,
        createdBundleId: '   ',
      }),
    ).toBeNull();
  });
});

describe('resolveSelectedDownloadBundleId', () => {
  const bundles = [{ id: 'a' }, { id: 'b' }, { id: 'new' }];

  it('초기 로드: 기존 선택 유지', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'initial',
        bundles,
        currentSelectedId: 'b',
      }),
    ).toBe('b');
  });

  it('초기 로드: 미선택이고 1건이면 자동 선택', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'initial',
        bundles: [{ id: 'only' }],
        currentSelectedId: '',
      }),
    ).toBe('only');
  });

  it('초기 로드: 미선택·다건이면 강제 선택 없음', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'initial',
        bundles,
        currentSelectedId: '',
      }),
    ).toBe('');
  });

  it('재조회: 신규 preferred가 목록에 있으면 자동 선택', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'refresh',
        bundles,
        currentSelectedId: 'a',
        preferredBundleId: 'new',
      }),
    ).toBe('new');
  });

  it('재조회: preferred 없으면 기존 유효 선택 유지', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'refresh',
        bundles,
        currentSelectedId: 'a',
        preferredBundleId: null,
      }),
    ).toBe('a');
  });

  it('재조회: none 선택 유지(해당 다운로드 없음)', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'refresh',
        bundles,
        currentSelectedId: 'none',
        preferredBundleId: null,
      }),
    ).toBe('none');
  });

  it('재조회: preferred가 목록에 있고 none이었어도 신규로 전환', () => {
    expect(
      resolveSelectedDownloadBundleId({
        mode: 'refresh',
        bundles,
        currentSelectedId: 'none',
        preferredBundleId: 'new',
      }),
    ).toBe('new');
  });
});
