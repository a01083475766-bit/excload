/**
 * 3PL orderData 입력 정규화 (run3PLPipeline 직전 전용)
 * EXCLOAD CONSTITUTION v4.3 — Stage1~3 내부 로직 변경 없음, 서버 입력 보정만 수행
 */

import { ALIAS_DICTIONARY } from "@/app/pipeline/base/alias-dictionary";

import {
  decomposeFreeTextFields,
  shouldDecomposeMixedBlob,
} from "./decompose-free-text-fields";

function isEmptyString(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function sanitizeScalar(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) {
    const j = v.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    return j === "" ? undefined : j;
  }
  if (typeof v === "object") {
    return undefined;
  }
  return String(v).trim() || undefined;
}

/** alias-dictionary 기준 헤더 (없으면 키 그대로) */
function resolveBaseHeader(key: string): string {
  return ALIAS_DICTIONARY[key] ?? key;
}

/** 기준헤더에 해당하는 칸이 비어 있을 때만 값을 채움 (별칭 키 우선) */
function setEmptyByBaseHeader(
  row: Record<string, unknown>,
  baseHeader: string,
  value: string | undefined
): void {
  if (value == null || String(value).trim() === "") return;
  const keys = Object.keys(row).filter((k) => resolveBaseHeader(k) === baseHeader);
  const targetKey = keys[0] ?? baseHeader;
  if (isEmptyString(row[targetKey])) {
    row[targetKey] = value;
  }
}

/**
 * 휴대폰(010/011/016/017/018/019) 11자리만 하이픈 포맷. 지역번호·일반번호 등은 원문 유지.
 */
function normalizePhoneValue(raw: string): string {
  const s = raw.trim();
  if (s === "") return "";
  const digits = s.replace(/\D/g, "");
  if (
    digits.length === 11 &&
    /^(010|011|016|017|018|019)/.test(digits)
  ) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return s;
}

function isPhoneRelatedKey(key: string): boolean {
  const base = resolveBaseHeader(key);
  const lower = key.toLowerCase();
  return (
    base.includes("전화") ||
    base.includes("연락처") ||
    base.includes("휴대폰") ||
    base.includes("핸드폰") ||
    lower.includes("phone") ||
    lower.includes("tel") ||
    lower.includes("mobile")
  );
}

/** 알려진 수량·단위만 분리 (무단위 문자열은 분리하지 않음). 긴 단위(mg, kg)를 짧은 단위(g)보다 앞에 둠 */
const PRODUCT_UNIT_SUFFIX =
  /^(.+?)(\d[\d.,]*\s*(?:kg|mg|g|ml|mL|ML|L|l|개|팩|박스|ea|EA|개입|입|장|병|통|봉|세트|SET|set|포|oz|OZ))$/i;

/**
 * "사과1kg", "우유 500ml" 등 → 단위(kg, g, ml, L, 개, 팩, 박스 등)가 붙은 경우만 상품명/옵션 분리
 */
function trySplitProductNameAndOption(
  productText: string
): { name: string; option?: string } {
  const t = productText.trim();
  const m = t.match(PRODUCT_UNIT_SUFFIX);
  if (m && m[1].trim().length >= 1) {
    return { name: m[1].trim(), option: m[2].trim() };
  }
  return { name: t };
}

function mergeValue(existing: string | undefined, incoming: string | undefined): string | undefined {
  if (incoming === undefined || incoming === "") return existing;
  if (existing !== undefined && existing !== "") return existing;
  return incoming;
}

/**
 * 상품명 문자열에 포함된 "보내는사람 … 전화" 패턴 분리 (키워드: 보내는사람)
 * - 기존 보내는사람 / 전화번호1 값이 있으면 caller에서 skip
 */
function extractEmbeddedSenderFromProduct(text: string): {
  remainder: string;
  senderName?: string;
  phone?: string;
} {
  const idx = text.indexOf("보내는사람");
  if (idx === -1) {
    return { remainder: text };
  }

  const before = text.slice(0, idx).trim();
  const after = text.slice(idx + "보내는사람".length).trim();
  if (after === "") {
    return { remainder: before };
  }

  const phoneRe =
    /(0(?:10|11|16|17|18|19)[-\s]?\d{3,4}[-\s]?\d{4}|0(?:10|11|16|17|18|19)\d{8})/;
  const pm = after.match(phoneRe);
  if (!pm || pm.index === undefined) {
    return { remainder: before, senderName: after };
  }

  const digits = pm[1].replace(/\D/g, "");
  if (digits.length !== 11 || !/^(010|011|016|017|018|019)/.test(digits)) {
    return { remainder: text };
  }

  const phoneFormatted = normalizePhoneValue(digits);
  const senderName = after.slice(0, pm.index).trim();

  return {
    remainder: before,
    ...(senderName ? { senderName } : {}),
    phone: phoneFormatted,
  };
}

function normalizeOneRow(
  raw: Record<string, unknown>,
  templateHeaders: string[] | undefined
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    const s = sanitizeScalar(val);
    if (s === undefined) continue;
    const prev = row[key];
    const merged = mergeValue(
      typeof prev === "string" ? prev : undefined,
      s
    );
    if (merged !== undefined) {
      row[key] = merged;
    }
  }

  for (const [key, val] of Object.entries(row)) {
    if (typeof val !== "string") continue;
    if (isPhoneRelatedKey(key)) {
      row[key] = normalizePhoneValue(val);
    }
  }

  const productKeys = Object.keys(row).filter((k) => resolveBaseHeader(k) === "상품명");
  if (productKeys.length > 0) {
    const pk = productKeys[0];
    const v = row[pk];
    if (typeof v === "string") {
      if (shouldDecomposeMixedBlob(v)) {
        const d = decomposeFreeTextFields(v);
        const didSplit =
          d.receiverName ||
          d.address ||
          d.phone ||
          d.productName ||
          d.senderName;
        if (didSplit) {
          setEmptyByBaseHeader(row, "받는사람", d.receiverName);
          setEmptyByBaseHeader(row, "받는사람주소1", d.address);
          setEmptyByBaseHeader(row, "받는사람전화1", d.phone);
          setEmptyByBaseHeader(row, "보내는사람", d.senderName);
          if (d.productName) {
            row[pk] = d.productName;
          }
        }
      }

      const v2 = row[pk];
      if (typeof v2 === "string") {
        const { name, option } = trySplitProductNameAndOption(v2);
        if (option && name !== v2) {
          row[pk] = name;
          const optionKeys = ["옵션명", "상품옵션", "상품상세", "상품상세1", "옵션"];
          for (const ok of optionKeys) {
            if (isEmptyString(row[ok])) {
              row[ok] = option;
              break;
            }
          }
        }
      }
    }
  }

  if (templateHeaders && templateHeaders.length > 0) {
    /** 동일 baseHeader당 템플릿 열은 한 번만 보강 (이미 값이 있는 열·이미 보강한 base는 제외) */
    const baseAlreadySatisfied = new Set<string>();
    for (const h of templateHeaders) {
      if (!isEmptyString(row[h])) {
        baseAlreadySatisfied.add(resolveBaseHeader(h));
      }
    }

    for (const h of templateHeaders) {
      if (!isEmptyString(row[h])) continue;
      const baseH = resolveBaseHeader(h);
      if (baseAlreadySatisfied.has(baseH)) continue;

      for (const k of Object.keys(row)) {
        if (k === h) continue;
        const baseK = resolveBaseHeader(k);
        if (baseK === baseH && !isEmptyString(row[k])) {
          row[h] = row[k];
          baseAlreadySatisfied.add(baseH);
          break;
        }
      }
    }
  }

  return row;
}

function rowHasMinimumSignal(row: Record<string, unknown>): boolean {
  const values = Object.values(row).filter(
    (v) => typeof v === "string" && v.trim() !== ""
  );
  return values.length >= 1;
}

/**
 * 3PL 미리보기용 orderData 정규화 (run3PLPipeline 호출 직전)
 *
 * @param orderData UI·어댑터에서 전달된 행 배열
 * @param templateHeaders 선택 시 별칭 키 → 템플릿 열 이름으로 값 복사(빈 칸만)
 */
export function normalize3plOrderDataInput(
  orderData: Record<string, unknown>[],
  templateHeaders?: string[]
): Record<string, unknown>[] {
  if (!Array.isArray(orderData)) {
    return [];
  }

  const out: Record<string, unknown>[] = [];

  for (const raw of orderData) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const row = normalizeOneRow(raw as Record<string, unknown>, templateHeaders);
    if (!rowHasMinimumSignal(row)) {
      continue;
    }
    out.push(row);
  }

  return out;
}
