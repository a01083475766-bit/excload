import { redirect } from 'next/navigation';

/**
 * 송장 매칭·전송은 주문연동 허브 하단에서 처리합니다.
 * 구 URL 북마크·외부 링크 호환용 리다이렉트.
 */
export default function ShipmentMatchPage() {
  redirect('/order/integration?focus=shipment-match');
}
