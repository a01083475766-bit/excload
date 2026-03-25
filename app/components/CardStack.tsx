"use client";

import { motion } from "framer-motion";
import { FallingCard } from "./FallingCard";

const labels = [
  "쇼핑몰 주문",
  "네이버 주문",
  "카카오톡 주문",
  "엑셀 주문 파일",
  "스마트스토어",
  "오픈마켓",
  "기타 주문",
];

interface CardStackProps {
  cubePosition: { x: number; y: number } | null;
  phase: number;
}

export function CardStack({ cubePosition, phase }: CardStackProps) {
  return (
    <motion.div 
      className="relative w-[180px] h-[130px]"
      initial="initial"
      animate={phase === 1 ? "animate" : phase === 2 ? "absorb" : "initial"}
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: 0.15,
          },
        },
        absorb: {},
      }}
    >
      {labels.map((label, i) => (
        <FallingCard 
          key={`${label}-${phase}`} 
          index={i} 
          label={label} 
          cubePosition={cubePosition}
          phase={phase}
        />
      ))}
    </motion.div>
  );
}
