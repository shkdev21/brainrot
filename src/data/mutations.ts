import type { MutationDef } from '../core/types';

// 배율은 원작 조사 데이터 그대로 (Gold 1.25 / Diamond 1.5 / Rainbow 10 …)

export const MUTATIONS: MutationDef[] = [
  { id: 'gold',    mult: 1.25, colorHex: 0xffd966, weight: 0.05 },
  { id: 'diamond', mult: 1.5,  colorHex: 0x7fd8ff, weight: 0.02 },
  { id: 'rainbow', mult: 10,   colorHex: 0xffffff, weight: 0.005 },
  // 이벤트 변이 — 경매 물품에만 부여
  { id: 'candy',   mult: 4, colorHex: 0xff9ecf, weight: 0, event: true },
  { id: 'lava',    mult: 6, colorHex: 0xff7a33, weight: 0, event: true },
  { id: 'galaxy',  mult: 7, colorHex: 0x9d6bff, weight: 0, event: true },
];

export const MUTATION_BY_ID: ReadonlyMap<string, MutationDef> = new Map(
  MUTATIONS.map((m) => [m.id, m]),
);

/** 자연 변이: 가중치 합 = 1이 되도록 '없음' 포함해 결정 */
export const NATURAL_MUTATION_WEIGHTS: Record<string, number> = {
  none: 0.925,
  gold: 0.05,
  diamond: 0.02,
  rainbow: 0.005,
};
