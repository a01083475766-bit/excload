import { OPEN_BETA_DEMO_VIDEO_SRC } from '@/app/lib/landing/open-beta-demo-video';

type OpenBetaDemoVideoProps = {
  className?: string;
};

/** 오픈 베타 랜딩 시연 영상 */
export default function OpenBetaDemoVideo({ className = '' }: OpenBetaDemoVideoProps) {
  return (
    <div
      className={`w-full overflow-hidden border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <video
        src={OPEN_BETA_DEMO_VIDEO_SRC}
        className="block w-full bg-black"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        controls
      />
    </div>
  );
}
