"use client";

import FavoriteMallsPanel from "@/app/components/FavoriteMallsPanel";

export default function OrderFetchPage() {
  return (
    <FavoriteMallsPanel
      backHref="/order-convert"
      backLabel="← 택배주문변환으로 돌아가기"
    />
  );
}
