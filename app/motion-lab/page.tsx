import HeroMotion from '@/app/components/hero-motion/HeroMotion';

export default function MotionLabPage() {
  return (
    <div className="min-h-screen p-8 bg-zinc-50 dark:bg-black border-2 border-red-500">
      <div className="max-w-6xl mx-auto border-2 border-blue-500">
        <h1 className="text-3xl font-bold text-black dark:text-zinc-50 mb-8">
          실험용 페이지
        </h1>
        
        {/* HeroMotion 컴포넌트 렌더링 */}
        <div>
          <HeroMotion enableShake={true} />
        </div>
      </div>
    </div>
  );
}
