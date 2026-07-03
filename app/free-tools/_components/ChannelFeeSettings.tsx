'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  COUPANG_CATEGORIES,
  COUPANG_ROCKET_SIZES,
  COUPANG_SALE_TYPES,
  INFLOW_PATHS,
  N_DELIVERY_DEFAULTS,
  SALES_CHANNELS,
  SELLER_TIERS,
  type CoupangCategoryId,
  type CoupangSaleType,
  type CoupangSize,
  type InflowPathId,
  type SalesChannel,
  type SellerTier,
  getCoupangRocketSize,
} from './marginChannelConfig';

export type ChannelFormState = {
  salesChannel: SalesChannel;
  salesFeeRate: string;
  paymentFeeRate: string;
  otherFeeRate: string;
  totalFeeRate: string;
  coupangSaleType: CoupangSaleType;
  coupangCategory: CoupangCategoryId;
  coupangSize: CoupangSize;
  sellerTier: SellerTier;
  inflowPath: InflowPathId;
  ndeliveryOutbound: string;
  ndeliveryStorage: string;
  ndeliveryPackaging: string;
  ndeliveryLogisticsOther: string;
  shopeeOverseasCost: string;
  feeDetailsExpanded: boolean;
};

type Props = {
  channel: ChannelFormState;
  onChange: <K extends keyof ChannelFormState>(key: K, value: ChannelFormState[K]) => void;
  onPercentChange: (key: 'salesFeeRate' | 'paymentFeeRate' | 'otherFeeRate' | 'totalFeeRate', value: string) => void;
  onAmountChange: (
    key: 'ndeliveryOutbound' | 'ndeliveryStorage' | 'ndeliveryPackaging' | 'ndeliveryLogisticsOther' | 'shopeeOverseasCost',
    value: string,
  ) => void;
  displayInputAmount: (value: string) => string;
};

function SelectButton({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-200'
          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function PercentField({
  label,
  description,
  value,
  onChange,
  highlight,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  highlight?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-zinc-950">{label}</span>
        {description && <span className="text-xs text-zinc-500">{description}</span>}
      </span>
      <div
        className={`mt-2 flex overflow-hidden rounded-lg border bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${
          highlight ? 'border-blue-300' : 'border-zinc-200'
        }`}
      >
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="min-w-0 flex-1 px-3 py-2.5 text-right text-sm outline-none"
        />
        <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">%</span>
      </div>
    </label>
  );
}

function AmountField({
  label,
  description,
  value,
  onChange,
  displayInputAmount,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  displayInputAmount: (value: string) => string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-zinc-950">{label}</span>
        {description && <span className="text-xs text-zinc-500">{description}</span>}
      </span>
      <div className="mt-2 flex overflow-hidden rounded-lg border border-zinc-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
        <input
          value={displayInputAmount(value)}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          placeholder={placeholder ?? '0'}
          className="min-w-0 flex-1 px-3 py-2.5 text-right text-sm outline-none"
        />
        <span className="flex items-center border-l border-zinc-100 bg-zinc-50 px-3 text-xs text-zinc-500">원</span>
      </div>
    </label>
  );
}

export function ChannelFeeSettings({
  channel,
  onChange,
  onPercentChange,
  onAmountChange,
  displayInputAmount,
}: Props) {
  const rocketSize = getCoupangRocketSize(channel.coupangSize);
  const selectedTier = SELLER_TIERS.find((item) => item.id === channel.sellerTier);
  const selectedInflow = INFLOW_PATHS.find((item) => item.id === channel.inflowPath);
  const selectedCategory = COUPANG_CATEGORIES.find((item) => item.id === channel.coupangCategory);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold text-zinc-950">판매 채널 / 수수료 설정</h4>
        <p className="mt-1 text-xs text-zinc-500">
          채널을 선택하면 기본 수수료가 자동 반영됩니다. 필요하면 직접 수정할 수 있습니다.
        </p>
        <div className="mt-2 h-px bg-zinc-100" />
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-900">판매 채널</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SALES_CHANNELS.map((item) => (
            <SelectButton
              key={item.id}
              active={channel.salesChannel === item.id}
              onClick={() => onChange('salesChannel', item.id)}
              className="min-h-[44px]"
            >
              {item.shortLabel}
            </SelectButton>
          ))}
        </div>
      </div>

      {channel.salesChannel === 'coupang' && (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">판매 방식</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COUPANG_SALE_TYPES.map((item) => (
                <SelectButton
                  key={item.id}
                  active={channel.coupangSaleType === item.id}
                  onClick={() => onChange('coupangSaleType', item.id)}
                >
                  {item.label}
                </SelectButton>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-900">카테고리</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COUPANG_CATEGORIES.map((item) => (
                <SelectButton
                  key={item.id}
                  active={channel.coupangCategory === item.id}
                  onClick={() => onChange('coupangCategory', item.id)}
                >
                  <span className="block">{item.label}</span>
                  {item.id !== 'custom' && (
                    <span className="mt-0.5 block text-xs font-normal text-zinc-500">{item.fee}%</span>
                  )}
                </SelectButton>
              ))}
            </div>
            {selectedCategory && channel.coupangCategory !== 'custom' && (
              <p className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                판매 수수료 {selectedCategory.fee}%
              </p>
            )}
          </div>

          {channel.coupangSaleType === 'rocket' && (
            <div>
              <p className="text-sm font-semibold text-zinc-900">상품 사이즈</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {COUPANG_ROCKET_SIZES.map((item) => (
                  <SelectButton
                    key={item.id}
                    active={channel.coupangSize === item.id}
                    onClick={() => onChange('coupangSize', item.id)}
                    className="text-center"
                  >
                    {item.label}
                  </SelectButton>
                ))}
              </div>
              {rocketSize && (
                <p className="mt-2 text-xs text-zinc-500">
                  입출고비 {rocketSize.outboundFee.toLocaleString('ko-KR')}원 · 보관료{' '}
                  {rocketSize.storageFeePerDay.toLocaleString('ko-KR')}원/일
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {(channel.salesChannel === 'smartstore' || channel.salesChannel === 'ndelivery') && (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-900">판매자 등급</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SELLER_TIERS.map((item) => (
                <SelectButton
                  key={item.id}
                  active={channel.sellerTier === item.id}
                  onClick={() => onChange('sellerTier', item.id)}
                >
                  <span className="block">{item.label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                    주문관리 {item.orderFee}%
                  </span>
                </SelectButton>
              ))}
            </div>
            {selectedTier && (
              <p className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                주문관리 수수료 {selectedTier.orderFee}%
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-900">유입 경로 / 판매 유형</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {INFLOW_PATHS.map((item) => (
                <SelectButton
                  key={item.id}
                  active={channel.inflowPath === item.id}
                  onClick={() => onChange('inflowPath', item.id)}
                >
                  <span className="block">{item.label}</span>
                  {item.id !== 'custom' && (
                    <span className="mt-0.5 block text-xs font-normal text-zinc-500">{item.fee}%</span>
                  )}
                </SelectButton>
              ))}
            </div>
            {selectedInflow && channel.inflowPath !== 'custom' && (
              <p className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                판매 수수료 {selectedInflow.fee}%
              </p>
            )}
          </div>
        </div>
      )}

      {channel.salesChannel === 'ndelivery' && (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-bold text-emerald-800">NFA (N배송 풀필먼트) 비용</p>
          <p className="text-xs text-emerald-700">주문 1건 기준 물류비를 입력하면 마진 계산에 반영됩니다.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AmountField
              label="주문당 출고비"
              value={channel.ndeliveryOutbound}
              onChange={(value) => onAmountChange('ndeliveryOutbound', value)}
              displayInputAmount={displayInputAmount}
              placeholder={N_DELIVERY_DEFAULTS.outboundFee}
            />
            <AmountField
              label="보관료"
              description="주문 1건 기준"
              value={channel.ndeliveryStorage}
              onChange={(value) => onAmountChange('ndeliveryStorage', value)}
              displayInputAmount={displayInputAmount}
            />
            <AmountField
              label="포장비"
              value={channel.ndeliveryPackaging}
              onChange={(value) => onAmountChange('ndeliveryPackaging', value)}
              displayInputAmount={displayInputAmount}
            />
            <AmountField
              label="기타 물류비"
              value={channel.ndeliveryLogisticsOther}
              onChange={(value) => onAmountChange('ndeliveryLogisticsOther', value)}
              displayInputAmount={displayInputAmount}
            />
          </div>
        </div>
      )}

      {channel.salesChannel === 'shopee' && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <AmountField
            label="해외 판매 추가 비용"
            description="물류·환전·기타 비용 (주문 1건 기준)"
            value={channel.shopeeOverseasCost}
            onChange={(value) => onAmountChange('shopeeOverseasCost', value)}
            displayInputAmount={displayInputAmount}
          />
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-white">
        <button
          type="button"
          onClick={() => onChange('feeDetailsExpanded', !channel.feeDetailsExpanded)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-zinc-900"
        >
          <span>수수료율 상세</span>
          {channel.feeDetailsExpanded ? (
            <ChevronUp className="size-4 shrink-0 text-zinc-500" aria-hidden />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
          )}
        </button>

        {channel.feeDetailsExpanded && (
          <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3">
            <PercentField
              label="판매 수수료율"
              description={
                channel.salesChannel === 'smartstore' || channel.salesChannel === 'ndelivery'
                  ? '주문관리 수수료'
                  : undefined
              }
              value={channel.salesFeeRate}
              onChange={(value) => onPercentChange('salesFeeRate', value)}
            />
            <PercentField
              label="결제·유입 수수료율"
              description={
                channel.salesChannel === 'smartstore' || channel.salesChannel === 'ndelivery'
                  ? '유입 경로 수수료'
                  : undefined
              }
              value={channel.paymentFeeRate}
              onChange={(value) => onPercentChange('paymentFeeRate', value)}
            />
            <PercentField
              label="기타 수수료율"
              value={channel.otherFeeRate}
              onChange={(value) => onPercentChange('otherFeeRate', value)}
            />
            <PercentField
              label="총 수수료율"
              description="자동 합산 · 직접 수정 가능"
              value={channel.totalFeeRate}
              onChange={(value) => onPercentChange('totalFeeRate', value)}
              highlight
            />
          </div>
        )}

        {!channel.feeDetailsExpanded && channel.totalFeeRate && (
          <div className="border-t border-zinc-100 px-4 pb-4">
            <p className="text-sm text-zinc-600">
              총 수수료율{' '}
              <span className="font-bold text-blue-700">{channel.totalFeeRate}%</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export const emptyChannelState: ChannelFormState = {
  salesChannel: 'manual',
  salesFeeRate: '',
  paymentFeeRate: '',
  otherFeeRate: '',
  totalFeeRate: '',
  coupangSaleType: 'marketplace',
  coupangCategory: 'electronics',
  coupangSize: 'small',
  sellerTier: 'general',
  inflowPath: 'shopping-search',
  ndeliveryOutbound: N_DELIVERY_DEFAULTS.outboundFee,
  ndeliveryStorage: '',
  ndeliveryPackaging: '',
  ndeliveryLogisticsOther: '',
  shopeeOverseasCost: '',
  feeDetailsExpanded: true,
};
