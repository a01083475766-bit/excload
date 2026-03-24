"use client";

import { motion } from "framer-motion";

interface FallingCardProps {
  index: number;
  label: string;
  cubePosition: { x: number; y: number } | null;
  phase: number;
}

export function FallingCard({
  index,
  label,
  cubePosition,
  phase,
}: FallingCardProps) {
  // PHASE 1: 카드 낙하 등장
  // PHASE 2: 카드 → 큐브 흡입
  
  return (
    <motion.div
      initial={{
        y: -40,
        opacity: 0,
      }}
      animate={
        phase === 2 && cubePosition
          ? {
              // PHASE 2: 큐브로 빨려 들어가는 애니메이션
              x: cubePosition.x,
              y: cubePosition.y,
              scale: 0,
              opacity: 0,
              rotateZ: 360,
            }
          : phase === 1
          ? {
              // PHASE 1: 위에서 아래로 떨어지는 애니메이션
              y: 0,
              opacity: 1,
              scale: 1,
              rotateZ: 0,
            }
          : {
              // 초기 상태
              y: -40,
              opacity: 0,
              scale: 1,
              rotateZ: 0,
            }
      }
      transition={
        phase === 2 && cubePosition
          ? {
              // PHASE 2: 흡입 애니메이션 (1초, easeIn)
              duration: 1.0,
              ease: "easeIn",
              delay: index * 0.1, // 약간의 stagger 효과
            }
          : phase === 1
          ? {
              // PHASE 1: 낙하 애니메이션 (0.4초, easeOut, stagger 0.15)
              duration: 0.4,
              ease: "easeOut",
              delay: index * 0.15, // staggerChildren과 동일한 간격
            }
          : {
              duration: 0,
            }
      }
      className="absolute card"
      style={{ 
        zIndex: 20 - index,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {label}
    </motion.div>
  );
}
