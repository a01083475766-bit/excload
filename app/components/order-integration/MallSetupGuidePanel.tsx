import { ExternalLink } from 'lucide-react';
import type { MallSetupGuide } from '@/app/lib/order-integration/mall-setup-guides';

type Props = {
  guide: MallSetupGuide | undefined;
  mallName: string;
};

/** 오른쪽: 해당 쇼핑몰 판매자센터 경로·연동 안내 */
export function MallSetupGuidePanel({ guide, mallName }: Props) {
  if (!guide) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <h3 className="text-lg font-bold text-zinc-950">{mallName} 안내</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          이 쇼핑몰용 상세 안내가 아직 정리되지 않았습니다. 왼쪽에서 키를 입력하고 연결 테스트를
          진행해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <h3 className="text-lg font-bold text-zinc-950">{guide.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        판매자센터에서 API(또는 앱)를 발급한 뒤, 엑클로드 정보를 등록하고 왼쪽 입력란에 키를
        넣습니다.
      </p>

      {guide.sellerCenterHref ? (
        <a
          href={guide.sellerCenterHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {guide.sellerCenterLabel ?? '판매자센터 바로가기'}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}

      <ol className="mt-6 space-y-4">
        {guide.steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-semibold text-blue-700">
              {index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-zinc-900">{step.title}</p>
              <div className="mt-1 text-sm leading-relaxed text-zinc-600">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>

      {guide.notes && guide.notes.length > 0 ? (
        <ul className="mt-6 list-inside list-disc space-y-1 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
          {guide.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
