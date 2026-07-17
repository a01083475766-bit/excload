import { registerHealthAdapter } from '../provider-health-registry';
import { smartstoreHealthAdapter } from './smartstore';
import { coupangHealthAdapter } from './coupang';
import { elevenHealthAdapter } from './eleven';
import { cafe24HealthAdapter } from './cafe24';
import { lotteonHealthAdapter } from './lotteon';
import { ssgHealthAdapter } from './ssg';
import { cjonstyleHealthAdapter } from './cjonstyle';
import { shopbyHealthAdapter } from './shopby';
import { godomallHealthAdapter } from './godomall';
import { makeshopHealthAdapter } from './makeshop';

let registered = false;

/** 내장 연결 확인 어댑터를 한 번만 등록한다(라우트 진입 시 호출). */
export function registerBuiltInHealthAdapters(): void {
  if (registered) return;
  registerHealthAdapter(smartstoreHealthAdapter);
  registerHealthAdapter(coupangHealthAdapter);
  registerHealthAdapter(elevenHealthAdapter);
  registerHealthAdapter(cafe24HealthAdapter);
  registerHealthAdapter(lotteonHealthAdapter);
  registerHealthAdapter(ssgHealthAdapter);
  registerHealthAdapter(cjonstyleHealthAdapter);
  registerHealthAdapter(shopbyHealthAdapter);
  registerHealthAdapter(godomallHealthAdapter);
  registerHealthAdapter(makeshopHealthAdapter);
  registered = true;
}
