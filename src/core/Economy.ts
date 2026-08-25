import type { GameState, BrainrotInstance } from './types';
import { brainrotById } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { range, type Rng } from './rng';

// 경제 계산 — 순수 함수로만 구성 (테스트 용이)

export function formatMoney(n: number): string {
  if (n < 1000) return `$${Math.floor(n)}`;
  const units: [number, string][] = [
    [1e3, 'K'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T'], [1e15, 'Qa'],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [div, suffix] = units[i];
    if (n >= div) {
      const v = n / div;
      return `$${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${suffix}`;
    }
  }
  return `$${n}`;
}

export function instanceIncome(inst: BrainrotInstance): number {
  const def = brainrotById.get(inst.defId);
  if (!def) return 0;
  const mut = inst.mutation ? MUTATION_BY_ID.get(inst.mutation) : null;
  return def.baseIncome * (mut ? mut.mult : 1);
}

/** 기지에 도착해 수입 중인 브레인롯만 합산 */
export function playerIncomePerSec(state: GameState, playerId: string): number {
  let sum = 0;
  for (const inst of state.brainrots) {
    if (inst.ownerId === playerId && inst.location === 'base' && inst.earning) {
      sum += instanceIncome(inst);
    }
  }
  return sum;
}

export function ownedCount(state: GameState, playerId: string): number {
  let n = 0;
  for (const inst of state.brainrots) {
    if (inst.ownerId === playerId && inst.location === 'base') n++;
  }
  return n;
}

// ── 스폰 스케줄러 ──────────────────────────────────────────────

export interface SpawnTiming {
  minMs: number;
  maxMs: number;
}

/** 웹 세션용 튜닝 값 — 원작: 전설 5분 확정, 신화 15분(경매로 대체) */
export const SPAWN_TIMING: Record<string, SpawnTiming> = {
  common: { minMs: 12000, maxMs: 25000 },
  rare: { minMs: 30000, maxMs: 60000 },
  epic: { minMs: 90000, maxMs: 150000 },
  legendary: { minMs: 300000, maxMs: 300000 },
};

/** 카펫 동시 스폰 상한 */
export const CARPET_CAP = 6;
/** 카펫 미판매 만료 */
export const CARPET_TTL_MS = 60000;
/** 구매 후 기지까지 걷는 시간 */
export const WALK_MS = 2000;

export function nextSpawnDelayMs(rng: Rng, rarity: string): number {
  const t = SPAWN_TIMING[rarity] ?? SPAWN_TIMING.common;
  return range(rng, t.minMs, t.maxMs);
}
