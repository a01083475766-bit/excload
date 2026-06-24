import { describe, expect, it } from 'vitest'

import { ExcelPreprocessPipeline } from '../excel-preprocess-pipeline'

describe('ExcelPreprocessPipeline', () => {
  it('요청사항에 헤더 키워드가 들어간 주문 행을 유지한다', () => {
    const header = ['주문번호', '받는사람', '받는사람전화', '받는사람주소', '상품명', '판매자 요청사항']
    const pipeline = new ExcelPreprocessPipeline()

    const result = pipeline.run([
      header,
      [
        '403268162',
        '경자청(첨부파일 참고)',
        '010-1234-5678',
        '인천시 미추홀구',
        '[청송사과한과] 청송애유과 1kg',
        '엑셀파일에 있는 주소지로 배송요청합니다',
      ],
      header,
      [
        '403210300',
        '박종선',
        '010-1234-5678',
        '고양시 일산동구',
        '[손예담]청송애 유과 동글이(1kg)',
        '배송지 주소는 별도로 보내드리겠습니다.',
      ],
    ])

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row[0])).toEqual(['403268162', '403210300'])
  })
})
