import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/GameState';
import {
  tryPickUp, arriveOwnBase, dropCarried, updateDropped, smashDropped, isCarrying,
} from '../src/core/Carry';

function setup(seed = 21) {
  const g = new Game({ seed, startingMoney: 1e7 });
  // 피해자 b1의 기지에 브레인롯 배치
  const victim = g.player('b1')!;
  const inst = g.spawnOnCarpet('rare')!;
  g.buy('b1', inst.uid);
  g.tick(2500); // 도착 완료
  return { g, inst, victim };
}

describe('tryPickUp', () => {
  it('타인의 기지에서 훔치기 성공 — 소유권 해제+carried 상태', () => {
    const { g, inst } = setup();
    const res = tryPickUp(g, 'p0', inst.uid);
    expect(res.ok).toBe(true);
    expect(inst.location).toBe('carried');
    expect(inst.ownerId).toBeNull();
    expect(inst.slot).toBeNull();
    expect(g.player('p0')!.carrying).toBe(inst.uid);
  });

  it('훔친 뒤 피해자의 수입에서 제외된다', () => {
    const { g, inst } = setup();
    const before = g.state.brainrots.filter(
      (i) => i.ownerId === 'b1' && i.location === 'base' && i.earning,
    ).length;
    tryPickUp(g, 'p0', inst.uid);
    const after = g.state.brainrots.filter(
      (i) => i.ownerId === 'b1' && i.location === 'base' && i.earning,
    ).length;
    expect(after).toBe(before - 1);
  });

  it('내 브레인롯은 픽업 불가', () => {
    const g = new Game({ seed: 22, startingMoney: 1e7 });
    const inst = g.spawnOnCarpet('common')!;
    g.buy('p0', inst.uid);
    const res = tryPickUp(g, 'p0', inst.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('own-brainrot');
  });

  it('이미 들고 있으면 추가 픽업 불가', () => {
    const { g } = setup(23);
    const i1 = g.spawnOnCarpet('rare')!;
    g.buy('b1', i1.uid);
    const i2 = g.spawnOnCarpet('rare')!;
    g.buy('b2', i2.uid);
    g.tick(2500);
    expect(tryPickUp(g, 'p0', i1.uid).ok).toBe(true);
    const res = tryPickUp(g, 'p0', i2.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('already-carrying');
  });

  it('기절 중에는 픽업 불가', () => {
    const { g, inst } = setup(24);
    g.player('p0')!.stunUntil = g.state.timeMs + 5000;
    const res = tryPickUp(g, 'p0', inst.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('stunned');
  });

  it('잠긴 기지의 브레인롯은 픽업 불가', () => {
    const { g, inst } = setup(25);
    const base = g.base(1)!;
    base.lockedUntil = g.state.timeMs + 10000;
    const res = tryPickUp(g, 'p0', inst.uid);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('base-locked');
  });
});

describe('arriveOwnBase', () => {
  it('훔친 브레인롯을 내 기지로 운반하면 소유권 이전', () => {
    const { g, inst } = setup();
    tryPickUp(g, 'p0', inst.uid);
    const res = arriveOwnBase(g, 'p0');
    expect(res.ok).toBe(true);
    expect(inst.ownerId).toBe('p0');
    expect(inst.location).toBe('base');
    expect(inst.slot!.baseId).toBe(0);
    expect(g.player('p0')!.carrying).toBeNull();
    // 도착 애님 후 수입 시작
    g.tick(1500);
    expect(inst.earning).toBe(true);
  });

  it('풀슬롯이면 이전 거부하고 계속 들고 있음', () => {
    const g = new Game({ seed: 26, startingMoney: 1e9 });
    for (let i = 0; i < 10; i++) {
      const inst = g.spawnOnCarpet('common')!;
      g.buy('p0', inst.uid);
    }
    const victimInst = g.spawnOnCarpet('rare')!;
    g.buy('b1', victimInst.uid);
    g.tick(2500);
    tryPickUp(g, 'p0', victimInst.uid);
    const res = arriveOwnBase(g, 'p0');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('base-full');
    expect(g.player('p0')!.carrying).toBe(victimInst.uid);
  });
});

describe('dropCarried / dropped lifecycle', () => {
  it('기절 시 드롭 — 무주공해 상태가 되고 다른 누구나 주울 수 있다', () => {
    const { g, inst } = setup(27);
    tryPickUp(g, 'p0', inst.uid);
    dropCarried(g, 'p0', 'stun');
    expect(inst.location).toBe('dropped');
    expect(g.player('p0')!.carrying).toBeNull();
    // 다른 봇이 회수
    const res = tryPickUp(g, 'b2', inst.uid);
    expect(res.ok).toBe(true);
    expect(inst.location).toBe('carried');
  });

  it('드롭 아이템은 120초 후 소멸', () => {
    const { g, inst } = setup(28);
    tryPickUp(g, 'p0', inst.uid);
    dropCarried(g, 'p0', 'stun');
    g.tick(121000);
    updateDropped(g);
    expect(g.instance(inst.uid)).toBeUndefined();
  });

  it('드롭 아이템을 때리면 증발한다 (원작 규칙)', () => {
    const { g, inst } = setup(29);
    tryPickUp(g, 'p0', inst.uid);
    dropCarried(g, 'p0', 'stun');
    expect(smashDropped(g, inst.uid)).toBe(true);
    expect(g.instance(inst.uid)).toBeUndefined();
  });
});

describe('carry penalty', () => {
  it('운반 중 이속 감소 유지, 하차 후 해제', () => {
    const { g } = setup(30);
    const i1 = g.spawnOnCarpet('rare')!;
    g.buy('b1', i1.uid);
    g.tick(2500);
    tryPickUp(g, 'p0', i1.uid);
    g.tick(1000);
    expect(g.player('p0')!.slowUntil).toBeGreaterThan(g.state.timeMs);
    arriveOwnBase(g, 'p0');
    g.tick(1000);
    expect(isCarrying(g, 'p0')).toBe(false);
  });
});
