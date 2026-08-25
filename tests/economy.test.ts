import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/GameState';
import { formatMoney, playerIncomePerSec, instanceIncome } from '../src/core/Economy';
import { brainrotById } from '../src/data/brainrots';
import { MUTATION_BY_ID } from '../src/data/mutations';

function makeGame(seed = 1) {
  return new Game({ seed, startingMoney: 1_000_000 });
}

describe('formatMoney', () => {
  it('단위 포맷', () => {
    expect(formatMoney(25)).toBe('$25');
    expect(formatMoney(1500)).toBe('$1.5K');
    expect(formatMoney(1_000_000)).toBe('$1.0M');
    expect(formatMoney(250_000_000)).toBe('$250M');
    expect(formatMoney(1e12)).toBe('$1.0T');
  });
});

describe('income', () => {
  it('변이 배율이 적용된다', () => {
    const inst = {
      uid: 't', defId: 'trippi', mutation: 'gold',
      ownerId: 'p0', location: 'base' as const, slot: null,
      walkingUntil: 0, expiresAt: 0, earning: true,
    };
    expect(instanceIncome(inst)).toBe(15 * 1.25);
  });

  it('수입은 기지 도착(earning) 후에만 발생', () => {
    const g = makeGame(2);
    const inst = g.spawnOnCarpet('common')!;
    g.buy('p0', inst.uid);
    // 걷는 중 → 0
    expect(playerIncomePerSec(g.state, 'p0')).toBe(0);
    g.tick(2500); // 도착
    const def = brainrotById.get(inst.defId)!;
    const mut = inst.mutation ? MUTATION_BY_ID.get(inst.mutation)!.mult : 1;
    expect(playerIncomePerSec(g.state, 'p0')).toBeCloseTo(def.baseIncome * mut);
  });

  it('5초 틱 후 잔액에 Σ(income×mult)×초가 반영', () => {
    const g = makeGame(3);
    const a = g.spawnOnCarpet('common')!;
    const b = g.spawnOnCarpet('rare')!;
    g.buy('p0', a.uid);
    g.buy('p0', b.uid);
    g.tick(2500); // 도착
    const before = g.player('p0')!.money;
    g.tick(5000);
    const after = g.player('p0')!.money;
    const expected = playerIncomePerSec(g.state, 'p0') * 5;
    expect(after - before).toBeCloseTo(expected, 0);
  });
});

describe('buy', () => {
  it('잔액 부족 시 거부', () => {
    const g = new Game({ seed: 4, startingMoney: 10 });
    const inst = g.spawnOnCarpet('rare')!;
    const res = g.buy('p0', inst.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-enough-money');
    expect(inst.ownerId).toBeNull();
  });

  it('구매 성공 시 소유권+슬롯 배정+걷기 시작', () => {
    const g = makeGame(5);
    const inst = g.spawnOnCarpet('common')!;
    const res = g.buy('p0', inst.uid);
    expect(res.ok).toBe(true);
    expect(inst.ownerId).toBe('p0');
    expect(inst.location).toBe('base');
    expect(inst.slot!.baseId).toBe(0);
    expect(inst.earning).toBe(false);
    expect(inst.walkingUntil).toBeGreaterThan(0);
  });

  it('슬롯 만석 시 거부', () => {
    const g = new Game({ seed: 6, startingMoney: 1e9 });
    for (let i = 0; i < 10; i++) {
      const inst = g.spawnOnCarpet('common')!;
      expect(g.buy('p0', inst.uid).ok).toBe(true);
    }
    const inst11 = g.spawnOnCarpet('common')!;
    const res = g.buy('p0', inst11.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('base-full');
  });

  it('이미 팔린 스폰은 재구매 불가', () => {
    const g = makeGame(7);
    const inst = g.spawnOnCarpet('common')!;
    g.buy('p0', inst.uid);
    const res = g.buy('b1', inst.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-on-carpet');
  });
});

describe('spawn scheduler', () => {
  it('시드 고정 시 스폰 타이밍이 재현된다', () => {
    const g1 = makeGame(11);
    const g2 = makeGame(11);
    const r1 = g1.spawnOnCarpet('common')!;
    const r2 = g2.spawnOnCarpet('common')!;
    expect(r1.defId).toBe(r2.defId);
    expect(r1.mutation).toBe(r2.mutation);
  });

  it('카펫 스폰은 60초 후 만료된다', () => {
    const g = makeGame(12);
    const inst = g.spawnOnCarpet('common')!;
    g.tick(61000);
    expect(g.instance(inst.uid)).toBeUndefined();
  });

  it('커먼 첫 스폰은 게임 시작 직후 등장한다', () => {
    const g = makeGame(13);
    g.tick(600);
    expect(g.state.brainrots.some((i) => i.location === 'carpet')).toBe(true);
  });

  it('경매 전용 등급은 카펫에 스폰되지 않는다', () => {
    const g = makeGame(14);
    for (let i = 0; i < 50; i++) {
      const inst = g.spawnOnCarpet('legendary');
      if (inst) {
        const def = brainrotById.get(inst.defId)!;
        expect(def.auctionOnly).toBeFalsy();
      }
    }
  });
});

describe('world setup', () => {
  it('8명 플레이어와 8개 기지로 초기화', () => {
    const g = makeGame(15);
    expect(g.state.players.length).toBe(8);
    expect(g.state.bases.length).toBe(8);
    expect(g.player('p0')!.isBot).toBe(false);
    expect(g.state.players.filter((p) => p.isBot).length).toBe(7);
    for (let i = 0; i < 8; i++) {
      expect(g.state.bases[i].ownerId).toBe(g.state.players[i].id);
    }
  });
});
