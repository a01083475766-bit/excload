/**
 * "네이버 BEST 키워드 가져오기" — https://snxbest.naver.com/keyword/best 실시간 fetch (서버 전용, 실험 기능)
 *
 * ⚠️ 공식 API가 아니라 공개 웹페이지를 그대로 가져옵니다. 페이지 구조가 바뀌면 실패할 수 있습니다
 * (실패 처리는 route.ts에서 파싱 결과 0개 여부로 판단합니다).
 * ⚠️ 원문 HTML은 호출한 곳에서도 로그에 남기지 않아야 합니다 — 이 함수 자체도 로그를 남기지 않습니다.
 */

const NAVER_BEST_KEYWORD_URL = 'https://snxbest.naver.com/keyword/best';
const FETCH_TIMEOUT_MS = 8000;

export class NaverBestKeywordsFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NaverBestKeywordsFetchError';
    this.status = status;
  }
}

/** HTML 원문을 그대로 반환 — 파싱은 parse.ts에서 별도로 수행합니다 */
export async function fetchNaverBestKeywordsHtml(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NAVER_BEST_KEYWORD_URL, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new NaverBestKeywordsFetchError(`HTTP ${res.status}`, res.status);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof NaverBestKeywordsFetchError) throw err;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new NaverBestKeywordsFetchError(isAbort ? 'timeout' : 'fetch failed', 0);
  } finally {
    clearTimeout(timeoutId);
  }
}
