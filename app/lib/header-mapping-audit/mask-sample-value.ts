import {
  inferSampleValueType,
  type SampleValueType,
} from './infer-sample-value-type';

export type MaskSampleValueOptions = {
  header?: string | null;
  valueType?: SampleValueType;
};

export type MaskedSampleValue = {
  value: string;
  type: SampleValueType;
  masked: boolean;
  shouldStore: boolean;
};

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return '[전화번호]';

  const headLength = digits.startsWith('02') ? 2 : 3;
  const head = digits.slice(0, headLength);
  const tail = digits.slice(-4);
  const middleLength = Math.max(3, digits.length - headLength - 4);

  return `${head}-${'*'.repeat(middleLength)}-${tail}`;
}

function maskAddress(value: string): string {
  const tokens = value
    .replace(/[(),]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return '[주소]';

  const province = tokens[0];
  const district = tokens.find((token, index) => index > 0 && /(?:시|군|구)$/.test(token));

  return district ? `${province} ${district} [주소]` : `${province} [주소]`;
}

function maskCode(value: string): string {
  const compact = value.trim();
  if (compact.length <= 4) return '*'.repeat(compact.length);

  const visibleHead = Math.min(3, Math.max(1, Math.floor(compact.length / 4)));
  const visibleTail = Math.min(3, Math.max(1, Math.floor(compact.length / 4)));
  const maskedLength = Math.max(3, compact.length - visibleHead - visibleTail);

  return `${compact.slice(0, visibleHead)}${'*'.repeat(maskedLength)}${compact.slice(-visibleTail)}`;
}

function normalizeNonPrivateValue(value: string): string {
  return value.trim().slice(0, 100);
}

export function maskSampleValue(
  rawValue: unknown,
  options: MaskSampleValueOptions = {},
): MaskedSampleValue {
  const value = String(rawValue ?? '').trim();
  const type = options.valueType ?? inferSampleValueType(value, { header: options.header });

  if (!value || type === 'EMPTY') {
    return {
      value: '',
      type: 'EMPTY',
      masked: false,
      shouldStore: false,
    };
  }

  switch (type) {
    case 'PHONE':
      return {
        value: maskPhone(value),
        type,
        masked: true,
        shouldStore: true,
      };
    case 'ADDRESS':
      return {
        value: maskAddress(value),
        type,
        masked: true,
        shouldStore: true,
      };
    case 'NAME':
      return {
        value: '[이름]',
        type,
        masked: true,
        shouldStore: true,
      };
    case 'MESSAGE':
      return {
        value: '[배송메시지]',
        type,
        masked: true,
        shouldStore: true,
      };
    case 'CODE':
      return {
        value: maskCode(value),
        type,
        masked: true,
        shouldStore: true,
      };
    case 'MONEY':
    case 'DATE':
    case 'STATUS':
      return {
        value: normalizeNonPrivateValue(value),
        type,
        masked: false,
        shouldStore: true,
      };
    case 'TEXT':
    default:
      return {
        value: '[텍스트]',
        type: 'TEXT',
        masked: true,
        shouldStore: true,
      };
  }
}
