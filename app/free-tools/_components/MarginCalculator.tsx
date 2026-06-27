'use client';

import { useState } from 'react';
import { AlertCircle, Calculator, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';

type FeeMode = 'sale-only' | 'sale-and-shipping';

type FormState = {
  salePrice: string;
  productCost: string;
  feeRate: string;
  customerShippingFee: string;
  actualShippingCost: string;
  packagingCost: string;
  adCost: string;
  otherCost: string;
  targetMarginRate: string;
  feeMode: FeeMode;
};

type AdditionalCost = {
  id: number;
  name: string;
  amount: string;
};

type CalculatedAdditionalCost = {
  id: number;
  name: string;
  amount: number;
};

type CalculationResult = {
  totalPayment: number;
  estimatedFee: number;
  settlementAmount: number;
  operatingCost: number;
  totalCost: number;
  profit: number;
  marginRate: number;
  roi: number | null;
  breakEvenSalePrice: number;
  breakEvenDiff: number;
  targetSalePrice: number | null;
  targetSalePriceMessage: string | null;
  additionalCosts: CalculatedAdditionalCost[];
  additionalCostTotal: number;
};

const emptyForm: FormState = {
  salePrice: '',
  productCost: '',
  feeRate: '',
  customerShippingFee: '',
  actualShippingCost: '',
  packagingCost: '',
  adCost: '',
  otherCost: '',
  targetMarginRate: '',
  feeMode: 'sale-only',
};

const exampleForm: FormState = {
  salePrice: '30000',
  productCost: '10000',
  feeRate: '6',
  customerShippingFee: '3000',
  actualShippingCost: '3500',
  packagingCost: '500',
  adCost: '1000',
  otherCost: '0',
  targetMarginRate: '20',
  feeMode: 'sale-only',
};

const exampleAdditionalCosts: AdditionalCost[] = [
  { id: 1, name: '냉매·보냉 비용', amount: '1500' },
];

const MAX_ADDITIONAL_COSTS = 10;

const amountFields = [
  {
    key: 'salePrice',
    label: '판매가',
    description: '고객이 실제 결제한 상품 금액',
    required: true,
  },
  {
    key: 'productCost',
    label: '상품 원가',
    description: '상품 매입비 또는 제조원가',
  },
  {
    key: 'customerShippingFee',
    label: '고객에게 받은 배송비',
    description: '무료배송이면 0원',
  },
  {
    key: 'actualShippingCost',
    label: '실제 택배비',
    description: '판매자가 택배사에 지출하는 금액',
  },
  {
    key: 'packagingCost',
    label: '포장비',
    description: '박스, 아이스팩, 완충재 등의 비용',
  },
  {
    key: 'adCost',
    label: '광고비',
    description: '주문 1건에 배분할 광고비',
  },
  {
    key: 'otherCost',
    label: '기타 비용',
    description: '사은품, 작업비, 추가 비용 등',
  },
] as const;

function parseNumber(value: string) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountInput(value: string) {
  const digitsOnly = value.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';
  return String(Number(digitsOnly));
}

function formatPercentInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimals] = normalized.split('.');
  const decimal = decimals.join('');
  return decimals.length > 0 ? `${integer}.${decimal}` : integer;
}

function displayInputAmount(value: string) {
  if (!value) return '';
  return Number(value).toLocaleString('ko-KR');
}

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`;
}

function ResultPlaceholder() {
  return <span className="text-zinc-400">금액을 입력하고 계산하기를 눌러주세요.</span>;
}

function ResultRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'cost' | 'profit' | 'rate';
}) {
  const toneClass = {
    default: '',
    cost: 'rounded-lg bg-blue-50 px-2 text-blue-800',
    profit: 'rounded-lg bg-emerald-50 px-2 text-emerald-800',
    rate: 'rounded-lg bg-indigo-50 px-2 text-indigo-800',
  }[tone];

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-zinc-100 py-2 last:border-b-0 ${toneClass}`}
    >
      <span className="min-w-0 break-words text-zinc-600">{label}</span>
      <span className="shrink-0 break-words text-right font-semibold">{value}</span>
    </div>
  );
}

function getBreakEvenDiffMessage(diff: number) {
  const amount = formatWon(Math.abs(diff));

  if (diff > 0) {
    return {
      message: `손익분기 판매가보다 ${amount} 높습니다.`,
      className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    };
  }

  if (diff < 0) {
    return {
      message: `손익분기까지 ${amount}이 부족합니다.`,
      className: 'border-red-100 bg-red-50 text-red-700',
    };
  }

  return {
    message: '현재 판매가는 손익분기 판매가와 같습니다.',
    className: 'border-zinc-200 bg-white text-zinc-600',
  };
}

function getAdditionalCostDisplayName(cost: AdditionalCost | CalculatedAdditionalCost, index: number) {
  const name = cost.name.trim();
  return name || `추가 비용 ${index + 1}`;
}

export function MarginCalculator() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setResult(null);
  };

  const updateAmountField = (key: keyof FormState, value: string) => {
    updateField(key, formatAmountInput(value));
  };

  const updatePercentField = (key: keyof FormState, value: string) => {
    updateField(key, formatPercentInput(value));
  };

  const fillExample = () => {
    setForm(exampleForm);
    setAdditionalCosts(exampleAdditionalCosts);
    setError(null);
    setResult(null);
  };

  const reset = () => {
    setForm(emptyForm);
    setAdditionalCosts([]);
    setError(null);
    setResult(null);
  };

  const addAdditionalCost = () => {
    if (additionalCosts.length >= MAX_ADDITIONAL_COSTS) return;

    setAdditionalCosts((prev) => [
      ...prev,
      { id: Date.now(), name: '', amount: '' },
    ]);
    setError(null);
    setResult(null);
  };

  const updateAdditionalCost = (
    id: number,
    key: 'name' | 'amount',
    value: string,
  ) => {
    setAdditionalCosts((prev) =>
      prev.map((cost) =>
        cost.id === id
          ? {
              ...cost,
              [key]: key === 'amount' ? formatAmountInput(value) : value.slice(0, 30),
            }
          : cost,
      ),
    );
    setError(null);
    setResult(null);
  };

  const removeAdditionalCost = (id: number) => {
    setAdditionalCosts((prev) => prev.filter((cost) => cost.id !== id));
    setError(null);
    setResult(null);
  };

  const calculate = () => {
    const salePrice = parseNumber(form.salePrice);
    const productCost = parseNumber(form.productCost);
    const feeRate = parseNumber(form.feeRate);
    const customerShippingFee = parseNumber(form.customerShippingFee);
    const actualShippingCost = parseNumber(form.actualShippingCost);
    const packagingCost = parseNumber(form.packagingCost);
    const adCost = parseNumber(form.adCost);
    const otherCost = parseNumber(form.otherCost);
    const targetMarginRate = form.targetMarginRate ? parseNumber(form.targetMarginRate) : null;
    const calculatedAdditionalCosts = additionalCosts
      .map((cost, index) => ({
        id: cost.id,
        name: getAdditionalCostDisplayName(cost, index),
        amount: parseNumber(cost.amount),
      }))
      .filter((cost) => cost.amount > 0);
    const additionalCostTotal = calculatedAdditionalCosts.reduce(
      (sum, cost) => sum + cost.amount,
      0,
    );

    if (salePrice <= 0) {
      setError('판매가는 0보다 큰 금액으로 입력해 주세요.');
      setResult(null);
      return;
    }

    if (feeRate >= 100) {
      setError('쇼핑몰 수수료율은 100%보다 작아야 합니다.');
      setResult(null);
      return;
    }

    if (targetMarginRate !== null && targetMarginRate >= 100) {
      setError('목표 마진율은 100%보다 작아야 합니다.');
      setResult(null);
      return;
    }

    const feeRatio = feeRate / 100;
    const totalPayment = salePrice + customerShippingFee;
    const feeBase = form.feeMode === 'sale-only' ? salePrice : totalPayment;
    const estimatedFee = feeBase * feeRatio;
    const settlementAmount = totalPayment - estimatedFee;
    const operatingCost =
      productCost + actualShippingCost + packagingCost + adCost + otherCost + additionalCostTotal;
    const totalCost = operatingCost + estimatedFee;
    const profit = totalPayment - totalCost;
    const marginRate = totalPayment === 0 ? 0 : (profit / totalPayment) * 100;
    const roi = totalCost === 0 ? null : (profit / totalCost) * 100;

    const breakEvenDenominator = 1 - feeRatio;
    if (breakEvenDenominator <= 0) {
      setError('수수료율이 100% 이상이면 손익분기 판매가를 계산할 수 없습니다.');
      setResult(null);
      return;
    }

    const rawBreakEvenSalePrice =
      form.feeMode === 'sale-only'
        ? (operatingCost - customerShippingFee) / breakEvenDenominator
        : operatingCost / breakEvenDenominator - customerShippingFee;
    const breakEvenSalePrice = Math.ceil(Math.max(0, rawBreakEvenSalePrice));

    let targetSalePrice: number | null = null;
    let targetSalePriceMessage: string | null =
      '목표 마진율을 입력하면 추천 판매가를 확인할 수 있습니다.';

    if (targetMarginRate !== null) {
      const targetMarginRatio = targetMarginRate / 100;
      const targetDenominator = 1 - feeRatio - targetMarginRatio;

      if (targetDenominator <= 0) {
        targetSalePriceMessage = '수수료율과 목표 마진율의 합은 100%보다 작아야 합니다.';
      } else {
        const rawTargetSalePrice =
          form.feeMode === 'sale-only'
            ? (operatingCost - customerShippingFee * (1 - targetMarginRatio)) /
              targetDenominator
            : operatingCost / targetDenominator - customerShippingFee;
        targetSalePrice = Math.ceil(Math.max(0, rawTargetSalePrice));
        targetSalePriceMessage = null;
      }
    }

    setError(null);
    setResult({
      totalPayment,
      estimatedFee,
      settlementAmount,
      operatingCost,
      totalCost,
      profit,
      marginRate,
      roi,
      breakEvenSalePrice,
      breakEvenDiff: salePrice - breakEvenSalePrice,
      targetSalePrice,
      targetSalePriceMessage,
      additionalCosts: calculatedAdditionalCosts,
      additionalCostTotal,
    });
  };

  const profitPositive = result ? result.profit >= 0 : true;
  const amountFieldByKey = Object.fromEntries(
    amountFields.map((field) => [field.key, field]),
  ) as Record<(typeof amountFields)[number]['key'], (typeof amountFields)[number]>;

  const renderAmountField = (field: (typeof amountFields)[number]) => (
    <label key={field.key} className="block">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-bold text-zinc-950">
          {field.label}
          {'required' in field && field.required && <span className="text-blue-600">*</span>}
        </span>
        <span className="text-xs text-zinc-500">{field.description}</span>
      </span>
      <div className="mt-2 flex overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <input
          value={displayInputAmount(form[field.key])}
          onChange={(event) => updateAmountField(field.key, event.target.value)}
          inputMode="numeric"
          placeholder="0"
          className="min-w-0 flex-1 px-3 py-2.5 text-right text-sm outline-none"
        />
        <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">
          원
        </span>
      </div>
    </label>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:items-start">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <Calculator className="mt-1 size-5 shrink-0 text-blue-600" aria-hidden />
          <div>
            <h3 className="text-lg font-bold text-zinc-950">입력 영역</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              상품 1건 기준으로 판매가와 비용을 입력해 예상 순이익과 마진율을 계산합니다.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-7">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-zinc-950">판매 정보</h4>
              <div className="mt-2 h-px bg-zinc-100" />
            </div>
            {renderAmountField(amountFieldByKey.salePrice)}
            {renderAmountField(amountFieldByKey.customerShippingFee)}
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-zinc-950">기본 비용</h4>
              <div className="mt-2 h-px bg-zinc-100" />
            </div>
            {renderAmountField(amountFieldByKey.productCost)}
            {renderAmountField(amountFieldByKey.actualShippingCost)}
            {renderAmountField(amountFieldByKey.packagingCost)}
            {renderAmountField(amountFieldByKey.adCost)}
            {renderAmountField(amountFieldByKey.otherCost)}
          </div>

          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-900">추가 비용 항목</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  냉매비, 작업비, 사은품 비용 등 필요한 항목을 직접 추가할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={addAdditionalCost}
                disabled={additionalCosts.length >= MAX_ADDITIONAL_COSTS}
                className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
              >
                <Plus className="size-4" aria-hidden />
                비용 항목 추가
              </button>
            </div>

            {additionalCosts.length > 0 && (
              <div className="mt-4 space-y-2">
                {additionalCosts.map((cost, index) => {
                  const displayName = getAdditionalCostDisplayName(cost, index);

                  return (
                    <div
                      key={cost.id}
                      className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"
                    >
                      <label className="block">
                        <span className="text-xs font-medium text-zinc-600">항목명</span>
                        <input
                          value={cost.name}
                          onChange={(event) =>
                            updateAdditionalCost(cost.id, 'name', event.target.value)
                          }
                          placeholder="예: 냉매비"
                          maxLength={30}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-zinc-600">금액</span>
                        <div className="mt-1 flex overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                          <input
                            value={displayInputAmount(cost.amount)}
                            onChange={(event) =>
                              updateAdditionalCost(cost.id, 'amount', event.target.value)
                            }
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`${displayName} 금액`}
                            className="min-w-0 flex-1 px-3 py-2 text-right text-sm outline-none"
                          />
                          <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">
                            원
                          </span>
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeAdditionalCost(cost.id)}
                        aria-label={`${displayName} 항목 삭제`}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 sm:mb-0.5"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {additionalCosts.length >= MAX_ADDITIONAL_COSTS && (
              <p className="mt-3 text-xs font-medium text-amber-700">
                추가 비용 항목은 최대 10개까지 입력할 수 있습니다.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-zinc-950">수수료와 목표</h4>
              <div className="mt-2 h-px bg-zinc-100" />
            </div>

            <label className="block">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-base font-bold text-zinc-950">쇼핑몰 수수료율</span>
                <span className="text-xs text-zinc-500">0 이상 100 미만, 소수 입력 가능</span>
              </span>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <input
                  value={form.feeRate}
                  onChange={(event) => updatePercentField('feeRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="min-w-0 flex-1 px-3 py-2.5 text-right text-sm outline-none"
                />
                <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">
                  %
                </span>
              </div>
            </label>

            <label className="block">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-base font-bold text-zinc-950">목표 마진율</span>
                <span className="text-xs text-zinc-500">목표 판매가 계산에 사용</span>
              </span>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <input
                  value={form.targetMarginRate}
                  onChange={(event) => updatePercentField('targetMarginRate', event.target.value)}
                  inputMode="decimal"
                  placeholder="선택"
                  className="min-w-0 flex-1 px-3 py-2.5 text-right text-sm outline-none"
                />
                <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">
                  %
                </span>
              </div>
            </label>

            <fieldset className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <legend className="px-1 text-sm font-semibold text-zinc-900">수수료 계산 기준</legend>
              <p className="mt-1 text-xs text-zinc-500">
                쇼핑몰마다 배송비의 수수료 포함 여부가 다를 수 있습니다.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'sale-only', label: '상품 판매가만' },
                  { value: 'sale-and-shipping', label: '상품 판매가 + 고객 배송비' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
                      form.feeMode === option.value
                        ? 'border-blue-400 bg-blue-50 text-blue-800'
                        : 'border-zinc-200 bg-white text-zinc-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="feeMode"
                      value={option.value}
                      checked={form.feeMode === option.value}
                      onChange={() => updateField('feeMode', option.value)}
                      className="size-4"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {error && (
          <div
            className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={calculate}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            계산하기
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={fillExample}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Sparkles className="size-4" aria-hidden />
              예시값 입력
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              초기화
            </button>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          입력한 값은 서버로 전송되거나 저장되지 않으며 현재 브라우저에서만 계산됩니다.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-36 xl:self-start">
        <h3 className="text-lg font-bold text-zinc-950">결과 표시 영역</h3>
        {!result && (
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            판매가와 비용을 입력한 뒤 계산하기를 누르면 예상 순이익, 마진율, 손익분기 판매가를
            확인할 수 있습니다.
          </p>
        )}
        <div className="mt-4 space-y-3">
          <div
            className={`rounded-xl border p-5 ${
              result && !profitPositive
                ? 'border-red-200 bg-red-50'
                : 'border-emerald-100 bg-emerald-50/70'
            }`}
          >
            <p className="text-sm font-semibold text-zinc-800">결과 요약</p>
            {result ? (
              <>
                <p
                  className={`mt-4 break-words text-3xl font-bold ${
                    profitPositive ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {formatWon(result.profit)}
                </p>
                <p className="mt-2 text-sm text-zinc-700">
                  매출 기준 마진율 {formatPercent(result.marginRate)}
                </p>
                {!profitPositive && (
                  <p className="mt-3 text-sm font-medium text-red-700">
                    현재 조건에서는 판매할수록 손실이 발생합니다.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm">
                <ResultPlaceholder />
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 text-sm">
            <p className="mb-3 font-semibold text-zinc-800">판매가 안내</p>
            {result ? (
              <>
                <ResultRow label="손익분기 최소 판매가" value={formatWon(result.breakEvenSalePrice)} />
                <p
                  className={`my-3 rounded-lg border p-3 text-sm font-semibold leading-relaxed break-words ${
                    getBreakEvenDiffMessage(result.breakEvenDiff).className
                  }`}
                >
                  {getBreakEvenDiffMessage(result.breakEvenDiff).message}
                </p>
                <ResultRow
                  label="목표 마진 판매가"
                  value={result.targetSalePrice === null ? '-' : formatWon(result.targetSalePrice)}
                />
                {result.targetSalePriceMessage && (
                  <p className="mt-3 rounded-lg bg-white p-3 text-xs leading-relaxed text-zinc-600">
                    {result.targetSalePriceMessage}
                  </p>
                )}
              </>
            ) : (
              <ResultPlaceholder />
            )}
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 text-sm">
            <p className="mb-3 font-semibold text-zinc-800">상세 결과</p>
            {result ? (
              <>
                <ResultRow label="총 결제금액" value={formatWon(result.totalPayment)} />
                <ResultRow label="예상 쇼핑몰 수수료" value={formatWon(result.estimatedFee)} />
                <ResultRow label="예상 정산금액" value={formatWon(result.settlementAmount)} />
                <ResultRow label="상품 원가" value={formatWon(parseNumber(form.productCost))} />
                <ResultRow label="실제 택배비" value={formatWon(parseNumber(form.actualShippingCost))} />
                <ResultRow label="포장비" value={formatWon(parseNumber(form.packagingCost))} />
                <ResultRow label="광고비" value={formatWon(parseNumber(form.adCost))} />
                <ResultRow label="기타 비용" value={formatWon(parseNumber(form.otherCost))} />
                {result.additionalCosts.map((cost) => (
                  <ResultRow key={cost.id} label={cost.name} value={formatWon(cost.amount)} />
                ))}
                {result.additionalCostTotal > 0 && (
                  <ResultRow
                    label="추가 비용 합계"
                    value={formatWon(result.additionalCostTotal)}
                  />
                )}
                <ResultRow label="총비용" value={formatWon(result.totalCost)} tone="cost" />
                <ResultRow label="예상 순이익" value={formatWon(result.profit)} tone="profit" />
                <ResultRow
                  label="매출 기준 마진율"
                  value={formatPercent(result.marginRate)}
                  tone="rate"
                />
                <ResultRow
                  label="투입비용 대비 수익률"
                  value={result.roi === null ? '-' : formatPercent(result.roi)}
                  tone="rate"
                />
              </>
            ) : (
              <ResultPlaceholder />
            )}
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 text-sm">
            <p className="mb-3 font-semibold text-zinc-800">확인 필요 항목</p>
            <ul className="space-y-2 text-zinc-600">
              <li>실제 수수료는 쇼핑몰, 상품 카테고리, 결제 방식에 따라 달라질 수 있습니다.</li>
              <li>부가세, 반품비, 할인 부담금 등은 별도로 확인해야 합니다.</li>
              <li>계산 결과는 예상값이며 실제 정산액과 차이가 날 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
