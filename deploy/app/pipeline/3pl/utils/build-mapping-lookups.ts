/**
 * 업로드된 매핑 엑셀(첫 행 헤더)에서 상품명→코드, 옵션명→코드 lookup 생성
 */

function normalizeHeaderForMatch(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()_\-/]/g, "");
}

export interface MappingLookups {
  /**
   * 상품명 + 옵션명 조합 lookup
   * key = normalize(상품명) + "||" + normalize(옵션명)
   */
  nameOptionMap: Map<string, string>;
  /**
   * 상품명 단독 lookup
   * key = normalize(상품명)
   */
  nameOnlyMap: Map<string, string>;
  /**
   * 옵션명 단독 -> 옵션코드 lookup
   */
  optionNameToCode: Map<string, string>;
}

const isEmpty = (v: any) => v === undefined || v === null || v === "";

// 요청하신 방식 그대로: 공백 제거 + 소문자화
const normalize = (v: string) => String(v ?? "").replace(/\s/g, "").toLowerCase();

export function buildMappingLookupsFromSheet(rows: string[][] | null | undefined): MappingLookups {
  const empty = {
    nameOptionMap: new Map<string, string>(),
    nameOnlyMap: new Map<string, string>(),
    optionNameToCode: new Map<string, string>(),
  };
  if (!rows || rows.length < 2) return empty;

  const header = (rows[0] ?? []).map((c) => String(c ?? "").trim());
  const normHeaders = header.map(normalizeHeaderForMatch);

  const findCol = (candidates: string[]): number => {
    for (const c of candidates) {
      const nc = normalizeHeaderForMatch(c);
      const idx = normHeaders.findIndex((h) => h === nc || h.includes(nc) || nc.includes(h));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = findCol(["상품명", "품명", "productname", "상품", "itemname"]);
  const codeIdx = findCol(["상품코드", "품목코드", "productcode", "code", "itemcode"]);
  const optNameIdx = findCol(["옵션명", "optionname", "옵션", "option"]);
  const optCodeIdx = findCol(["옵션코드", "optioncode"]);

  const nameOptionMap = new Map<string, string>();
  const nameOnlyMap = new Map<string, string>();
  const optionNameToCode = new Map<string, string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];

    // 상품코드: (상품명 + 옵션명) 우선, 실패 시 (상품명 단독) fallback 후보
    if (nameIdx >= 0 && codeIdx >= 0) {
      const productNameRaw = String(row[nameIdx] ?? "").trim();
      const productCodeRaw = String(row[codeIdx] ?? "").trim();
      const productNameKey = normalize(productNameRaw);

      if (!isEmpty(productNameKey) && !isEmpty(productCodeRaw)) {
        // 상품명 단독 lookup 후보
        nameOnlyMap.set(productNameKey, productCodeRaw);
      }

      if (optNameIdx >= 0) {
        const optionNameRaw = String(row[optNameIdx] ?? "").trim();
        const optionNameKey = normalize(optionNameRaw);
        if (!isEmpty(productNameKey) && !isEmpty(optionNameKey) && !isEmpty(productCodeRaw)) {
          const combinedKey = `${productNameKey}||${optionNameKey}`;
          nameOptionMap.set(combinedKey, productCodeRaw);
        }
      }
    }

    // 옵션코드: 옵션명 단독 -> 옵션코드
    if (optNameIdx >= 0 && optCodeIdx >= 0) {
      const optionNameRaw = String(row[optNameIdx] ?? "").trim();
      const optionCodeRaw = String(row[optCodeIdx] ?? "").trim();
      const optionNameKey = normalize(optionNameRaw);
      if (!isEmpty(optionNameKey) && !isEmpty(optionCodeRaw)) {
        optionNameToCode.set(optionNameKey, optionCodeRaw);
      }
    }
  }

  return { nameOptionMap, nameOnlyMap, optionNameToCode };
}
