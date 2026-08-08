/**
 * 11번가 연결 화면 안내 상태.
 * - settings_saved: 연동 정보가 저장됨 (실제 API 성공과 무관)
 * - test_success: 최근 연결 테스트가 성공함
 */
export type ElevenConnectionNoticeKind = 'settings_saved' | 'test_success';

export type ElevenConnectionNoticeAccount = {
  status: 'active' | 'inactive' | 'error';
  lastErrorMessage: string | null;
  lastTestedAt: string | null;
};

/**
 * @param options.hasLocalError 화면의 최신 연결 테스트 오류 배너가 떠 있는 동안
 *   이전 성공 배너가 남지 않도록 한다.
 */
export function resolveElevenConnectionNotice(
  account: ElevenConnectionNoticeAccount | null,
  options?: { hasLocalError?: boolean },
): ElevenConnectionNoticeKind | null {
  if (!account) return null;

  // 로컬/저장된 실패가 있으면 초록 성공 표시를 하지 않는다.
  if (options?.hasLocalError || account.lastErrorMessage) {
    return 'settings_saved';
  }

  if (account.status === 'active' && account.lastTestedAt) {
    return 'test_success';
  }

  return 'settings_saved';
}
