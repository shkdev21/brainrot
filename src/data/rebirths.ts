import type { RebirthDef } from '../core/types';

// 원작 환생 1~5단계 요구치를 그대로 사용 (2단계에 2층, 우리 체계 5단계에 3층 해금).

export const REBIRTHS: RebirthDef[] = [
  { level: 1, requiredBrainrotIds: ['trippi', 'gangster'],   requiredMoney: 500_000 },
  { level: 2, requiredBrainrotIds: ['boneca', 'brrbrr'],     requiredMoney: 1_500_000 },
  { level: 3, requiredBrainrotIds: ['trulimero', 'chimpanzini'], requiredMoney: 7_500_000 },
  { level: 4, requiredBrainrotIds: ['chefcrab', 'glorbo'],   requiredMoney: 25_000_000 },
  { level: 5, requiredBrainrotIds: ['frigocamelo', 'orangutini'], requiredMoney: 100_000_000 },
];

/** 환생 단계별 슬롯 증가 */
export const SLOTS_PER_REBIRTH = 4;
export const BASE_SLOTS = 10;
export const MAX_REBIRTH = REBIRTHS.length;
