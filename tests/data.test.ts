import { describe, it, expect } from 'vitest';
import { brainrots, brainrotById } from '../src/data/brainrots';
import { MUTATIONS, MUTATION_BY_ID, NATURAL_MUTATION_WEIGHTS } from '../src/data/mutations';
import { TOOLS, TOOL_BY_ID } from '../src/data/tools';
import { REBIRTHS, BASE_SLOTS, SLOTS_PER_REBIRTH } from '../src/data/rebirths';
import { makeRng, pick, weightedPick, hashStr } from '../src/core/rng';
import { displayName } from '../src/core/names';

describe('brainrot data', () => {
  it('등급 내에서 가격과 수입이 단조 증가한다', () => {
    const byRarity = new Map<string, typeof brainrots>();
    for (const b of brainrots) {
      const list = byRarity.get(b.rarity) ?? [];
      list.push(b);
      byRarity.set(b.rarity, list);
    }
    for (const [rarity, list] of byRarity) {
      const sorted = [...list].sort((a, b) => a.price - b.price);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].baseIncome, `${rarity} 등급 수입 단조`).toBeGreaterThanOrEqual(sorted[i - 1].baseIncome);
      }
    }
  });

  it('모든 가격과 수입이 양수다', () => {
    for (const b of brainrots) {
      expect(b.price).toBeGreaterThan(0);
      expect(b.baseIncome).toBeGreaterThan(0);
    }
  });

  it('id가 고유하다', () => {
    const ids = new Set(brainrots.map((b) => b.id));
    expect(ids.size).toBe(brainrots.length);
  });

  it('경매 전용 등급(god/secret)은 auctionOnly 플래그가 있다', () => {
    for (const b of brainrots) {
      if (b.rarity === 'god' || b.rarity === 'secret') {
        expect(b.auctionOnly).toBe(true);
      }
    }
  });
});

describe('mutation data', () => {
  it('원작 배율: gold 1.25 / diamond 1.5 / rainbow 10', () => {
    expect(MUTATION_BY_ID.get('gold')!.mult).toBe(1.25);
    expect(MUTATION_BY_ID.get('diamond')!.mult).toBe(1.5);
    expect(MUTATION_BY_ID.get('rainbow')!.mult).toBe(10);
  });

  it('이벤트 변이는 자연 가중치가 0이다', () => {
    for (const m of MUTATIONS) {
      if (m.event) expect(m.weight).toBe(0);
    }
  });

  it('자연 변이 가중치 합이 1이다', () => {
    const total = Object.values(NATURAL_MUTATION_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('tool data', () => {
  it('도구 10종, 환생 0~5 사이 해금', () => {
    expect(TOOLS.length).toBe(10);
    for (const t of TOOLS) {
      expect(t.unlockRebirth).toBeGreaterThanOrEqual(0);
      expect(t.unlockRebirth).toBeLessThanOrEqual(5);
    }
  });

  it('기본 도구(방망이·함정)는 0환생부터 해금', () => {
    expect(TOOL_BY_ID.get('bat')!.unlockRebirth).toBe(0);
    expect(TOOL_BY_ID.get('trap')!.unlockRebirth).toBe(0);
  });
});

describe('rebirth data', () => {
  it('요구 브레인롯 id가 모두 존재한다', () => {
    for (const r of REBIRTHS) {
      for (const id of r.requiredBrainrotIds) {
        expect(brainrotById.has(id), `missing ${id}`).toBe(true);
      }
    }
  });

  it('요구 돈이 단조 증가한다', () => {
    for (let i = 1; i < REBIRTHS.length; i++) {
      expect(REBIRTHS[i].requiredMoney).toBeGreaterThan(REBIRTHS[i - 1].requiredMoney);
    }
  });

  it('슬롯 공식이 정의되어 있다', () => {
    expect(BASE_SLOTS).toBe(10);
    expect(SLOTS_PER_REBIRTH).toBe(4);
  });
});

describe('seeded rng', () => {
  it('같은 시드 = 같은 시퀀스', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('다른 시드 = (거의 항상) 다른 시퀀스', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let diff = 0;
    for (let i = 0; i < 100; i++) if (a() !== b()) diff++;
    expect(diff).toBeGreaterThan(90);
  });

  it('weightedPick이 가중치 분포를 따른다', () => {
    const rng = makeRng(7);
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) {
      counts[weightedPick(rng, { a: 0.7, b: 0.3 })]++;
    }
    // 70% ±3%
    expect(counts.a).toBeGreaterThan(6700);
    expect(counts.a).toBeLessThan(7300);
  });

  it('pick이 배열 원소만 반환한다', () => {
    const rng = makeRng(3);
    const arr = [1, 2, 3];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(rng, arr));
    }
  });
});

describe('procedural names', () => {
  it('같은 id는 항상 같은 이름', () => {
    expect(displayName('trippi')).toBe(displayName('trippi'));
  });

  it('두 단어 밈 스타일 형식', () => {
    const n = displayName('bombardiro');
    expect(n).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('다른 id는 대부분 다른 이름', () => {
    const names = new Set(brainrots.map((b) => displayName(b.id)));
    // 40종 이상에서 충돌은 소수 허용
    expect(names.size).toBeGreaterThan(brainrots.length - 4);
  });

  it('hashStr이 결정적', () => {
    expect(hashStr('abc')).toBe(hashStr('abc'));
    expect(hashStr('abc')).not.toBe(hashStr('abd'));
  });
});
