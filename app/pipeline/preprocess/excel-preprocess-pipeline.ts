/**
 * EXCLOAD Excel Preprocess Pipeline
 * 
 * ⚠️ CONSTITUTION.md v4.0 준수
 * Stage 0: 입력 데이터 형식 정리 전용
 * 형식 정리 범위 내에서만 허용
 */

import { CleanInputFile } from './types'
import { detectHeaderRowIndex, isExcelHeaderRowText } from '@/app/lib/excel/sheet-header'

export class ExcelPreprocessPipeline {
  run(rawFile: any): CleanInputFile {
    const sheet = this.extractSheet(rawFile)

    const normalizedSheet = this.normalizeSheet(sheet)

    const cleanFile = this.buildCleanInputFile(normalizedSheet)

    return cleanFile
  }

  private extractSheet(rawFile: any): any {
    // TODO: 첫 시트 추출
    return rawFile
  }

  private normalizeSheet(sheet: any): any {
    // sheet가 2차원 배열이 아니면 그대로 반환
    if (!Array.isArray(sheet) || sheet.length === 0) {
      return sheet
    }

    // 1️⃣ 완전 빈 행 제거
    // 모든 셀이 null / undefined / '' 인 경우 제거
    let cleanedRows = sheet.filter((row) => {
      if (!Array.isArray(row)) {
        return false
      }
      // 행에 하나라도 비어있지 않은 셀이 있으면 유지
      return row.some((cell) => {
        return cell !== null && cell !== undefined && String(cell).trim() !== ''
      })
    })

    // 2️⃣ 완전 빈 열 제거
    // 해당 열의 모든 행이 비어있는 경우 제거
    if (cleanedRows.length === 0) {
      return []
    }

    // 최대 열 개수 찾기
    const maxColCount = Math.max(...cleanedRows.map((row) => Array.isArray(row) ? row.length : 0))

    // 각 열이 완전히 비어있는지 확인
    const nonEmptyColIndices: number[] = []
    for (let colIndex = 0; colIndex < maxColCount; colIndex++) {
      // 해당 열의 모든 행 확인
      const hasNonEmptyCell = cleanedRows.some((row) => {
        if (!Array.isArray(row)) {
          return false
        }
        const cell = row[colIndex]
        return cell !== null && cell !== undefined && String(cell).trim() !== ''
      })
      if (hasNonEmptyCell) {
        nonEmptyColIndices.push(colIndex)
      }
    }

    // 빈 열 제거된 2차원 배열 재구성
    cleanedRows = cleanedRows.map((row) => {
      if (!Array.isArray(row)) {
        return []
      }
      return nonEmptyColIndices.map((colIndex) => row[colIndex])
    })

    // 2.5️⃣ 위에서부터 긴 단일 셀 문장 행 제거
    // (이 로직은 헤더/데이터의 "중간 삽입" 케이스에 영향을 주지 않도록 상단부에서만 제한적으로 사용)
    while (cleanedRows.length > 0) {
      const firstRow = cleanedRows[0]

      if (!Array.isArray(firstRow)) {
        break
      }

      const nonEmptyCells = firstRow.filter((cell) => {
        return cell !== null && cell !== undefined && String(cell).trim() !== "";
      })

      const nonEmptyCount = nonEmptyCells.length

      // non-empty 셀이 1개 이하이고, 해당 셀의 길이 >= 15이면 제거
      if (nonEmptyCount <= 1 && nonEmptyCells.length > 0) {
        const cellLength = String(nonEmptyCells[0]).trim().length
        if (cellLength >= 15) {
          cleanedRows.shift()
          continue
        }
      }

      break
    }

    // 3️⃣ headerIndex 찾기 (키워드 기반, 중간 헤더 인식) — sheet-header와 동일 규칙
    const headerIndex = detectHeaderRowIndex(cleanedRows)
    const sliced = cleanedRows.slice(headerIndex)

    if (sliced.length === 0) {
      return []
    }

    const headerRow = sliced[0]
    const result: any[][] = [headerRow]

    // 5️⃣ 헤더 이후는 "행 전체 값 유무"로 유지하고,
    // 반복 헤더(키워드가 다시 등장하는 행)는 데이터로 취급하지 않기 위해 제외한다.
    for (let i = 1; i < sliced.length; i++) {
      const row = sliced[i]
      if (!Array.isArray(row)) continue

      const rowText = Object.values(row).join(" ")
      if (isExcelHeaderRowText(rowText)) continue

      result.push(row)
    }

    return result
  }

  private buildCleanInputFile(
    normalizedSheet: any
  ): CleanInputFile {
    if (!Array.isArray(normalizedSheet) || normalizedSheet.length === 0) {
      return {
        headers: [],
        rows: [],
        sourceType: 'excel'
      }
    }

    const headers = Array.isArray(normalizedSheet[0])
      ? normalizedSheet[0].map((cell: any) => String(cell ?? ''))
      : []

    const rows = normalizedSheet.slice(1).map((row: any[]) =>
      Array.isArray(row)
        ? row.map(cell => String(cell ?? ''))
        : []
    )

    return {
      headers,
      rows,
      sourceType: 'excel'
    }
  }
}
