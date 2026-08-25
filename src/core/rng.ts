// 시드 기반 RNG — 재현 가능한 게임 로직 테스트의 기반

export type Rng = () => number;

/** mulberry32: 빠르고 충분한 품질의 시드 RNG */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 가중치 테이블에서 하나 추출. weights 합은 1일 필요 없음 */
export function weightedPick<K extends string>(
  rng: Rng,
  weights: Partial<Record<K, number>>,
): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** 안정적 문자열 해시 (표시명 생성용) */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
