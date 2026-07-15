import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { DuplicateCheck } from '@/app/free-tools/_components/DuplicateCheck';
import { ExcelCsvConverter } from '@/app/free-tools/_components/ExcelCsvConverter';
import { ExcelToPdf } from '@/app/free-tools/_components/ExcelToPdf';
import { ImageCompressor } from '@/app/free-tools/_components/ImageCompressor';
import { ImageTextExtractor } from '@/app/free-tools/_components/ImageTextExtractor';
import { ImageToPdf } from '@/app/free-tools/_components/ImageToPdf';
import { MarginCalculator } from '@/app/free-tools/_components/MarginCalculator';
import { PdfMerger } from '@/app/free-tools/_components/PdfMerger';
import { PrivacyMask } from '@/app/free-tools/_components/PrivacyMask';
import { ProductLabelMaker } from '@/app/free-tools/_components/ProductLabelMaker';
import { QRCodeGenerator } from '@/app/free-tools/_components/QRCodeGenerator';
import type { FreeTool } from '@/app/free-tools/free-tools-data';

type Props = {
  tool: FreeTool;
};

export function ToolWorkspace({ tool }: Props) {
  const Icon = tool.icon;

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex gap-3 sm:gap-4">
            <span className="h-fit rounded-md border border-zinc-200 bg-zinc-50 p-2.5 text-blue-600 sm:p-3">
              <Icon className="size-6 sm:size-7" aria-hidden />
            </span>
            <div>
              <p className="mb-1 text-xs font-semibold text-blue-700">{tool.category}</p>
              <h2 className="text-xl font-bold text-zinc-950 sm:text-2xl">{tool.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:mt-3">
                {tool.pageDescription ?? tool.description}
              </p>
            </div>
          </div>
          <span
            className={`w-fit rounded border px-3 py-1 text-xs font-semibold ${
              tool.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-100 text-zinc-500'
            }`}
          >
            {tool.enabled ? '사용 가능' : '기능 준비중'}
          </span>
        </div>
      </section>

      {tool.slug === 'margin-calculator' ? (
        <MarginCalculator />
      ) : tool.slug === 'duplicate-check' ? (
        <DuplicateCheck />
      ) : tool.slug === 'privacy-mask' ? (
        <PrivacyMask />
      ) : tool.slug === 'image-resize' ? (
        <ImageCompressor />
      ) : tool.slug === 'image-text-extractor' ? (
        <ImageTextExtractor />
      ) : tool.slug === 'qr-code' ? (
        <QRCodeGenerator />
      ) : tool.slug === 'product-label' ? (
        <ProductLabelMaker />
      ) : tool.slug === 'excel-csv' ? (
        <ExcelCsvConverter />
      ) : tool.slug === 'excel-to-pdf' ? (
        <ExcelToPdf />
      ) : tool.slug === 'image-to-pdf' ? (
        <ImageToPdf />
      ) : tool.slug === 'pdf-merge' ? (
        <PdfMerger />
      ) : (
        <>
          <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="text-lg font-bold text-zinc-950">입력 영역</h3>
            <p className="mt-2 text-sm text-zinc-600">
              실제 기능 구현 단계에서 이 영역에 입력 폼과 실행 버튼을 연결합니다.
            </p>
            <div className="mt-5 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
              {tool.name} 입력 UI 자리
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="text-lg font-bold text-zinc-950">결과 표시 영역</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['결과 요약', '상세 결과', '확인 필요 항목', '다음 작업 안내'].map((label) => (
                <div key={label} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <CheckCircle2 className="size-4 text-blue-600" aria-hidden />
                    {label}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    기능 구현 후 처리 결과가 이곳에 표시됩니다.
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="rounded-md border border-zinc-200 border-l-4 border-l-blue-600 bg-white p-5 sm:p-6">
        <p className="text-sm font-semibold text-zinc-950">
          쇼핑몰 주문 파일도 반복해서 직접 정리하고 계신가요?
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          엑클로드에서는 쇼핑몰 주문 엑셀과 카톡 주문을 택배사 업로드 양식으로 정리할 수 있습니다.
        </p>
        <Link
          href="/order-convert"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          택배주문변환 알아보기
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
