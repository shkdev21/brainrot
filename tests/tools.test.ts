import { describe, it, expect, vi } from 'vitest';
import { Game } from '../src/core/GameState';
import { lockBase, canEnterBase, isBaseLocked } from '../src/core/BaseLock';
import { purchaseTool, useTool, applyStun, hasTool, MAX_TRAPS } from '../src/core/ToolEffects';
import { tryPickUp, arriveOwnBase } from '../src/core/Carry';

function setup(seed = 31, money = 1e7) {
  const g = new Game({ seed, startingMoney: money });
  // 테스트용 위치 배치: p0 원점, b1 3m 북쪽, b2 20m 북쪽
  g.state.positions = {
    p0: { x: 0, z: 0 },
    b1: { x: 0, z: 3 },
    b2: { x: 0, z: 20 },
    b3: { x: 0, z: 20 },
    b4: { x: 0, z: 20 },
    b5: { x: 0, z: 20 },
    b6: { x: 0, z: 20 },
    b7: { x: 0, z: 20 },
  };
  return g;
}

function giveTool(g: Game, id: string, toolId: string) {
  const p = g.player(id)!;
  p.purchasedTools.push(toolId);
}

describe('base lock', () => {
  it('잠금 성공 — 20초 지속 45초 쿨타임', () => {
    const g = setup();
    const res = lockBase(g, 'p0');
    expect(res.ok).toBe(true);
    expect(isBaseLocked(g, 0)).toBe(true);
    g.tick(21000);
    expect(isBaseLocked(g, 0)).toBe(false);
    // 쿨타임: 잠금 해제 후 즉시 재잠금 불가
    const res2 = lockBase(g, 'p0');
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe('on-cooldown');
    g.tick(25000);
    expect(lockBase(g, 'p0').ok).toBe(true);
  });

  it('잠긴 기지는 타인 침입 불가, 주인은 가능', () => {
    const g = setup();
    lockBase(g, 'b1');
    expect(canEnterBase(g, 'p0', 1)).toBe(false);
    expect(canEnterBase(g, 'b1', 1)).toBe(true);
  });

  it('해제 이벤트가 1회만 발생', () => {
    const g = setup();
    const spy = vi.fn();
    g.events.on('unlocked', spy);
    lockBase(g, 'p0');
    g.tick(21000);
    g.tick(1000);
    g.tick(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('purchaseTool', () => {
  it('구매 성공과 잔액 부족', () => {
    const g = new Game({ seed: 32, startingMoney: 1000 });
    expect(purchaseTool(g, 'p0', 'bat').ok).toBe(true);
    expect(g.player('p0')!.money).toBe(500);
    // 함정은 $1000 — 남은 500으로 부족
    const res = purchaseTool(g, 'p0', 'trap');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-enough-money');
    expect(purchaseTool(g, 'p0', 'boots').ok).toBe(false);
  });

  it('환생 부족 시 잠긴 도구 거부', () => {
    const g = setup(33);
    expect(purchaseTool(g, 'p0', 'medusa').ok).toBe(false);
    expect(purchaseTool(g, 'p0', 'medusa').reason).toBe('locked');
  });
});

describe('useTool', () => {
  const aim = { x: 0, z: 1 };

  it('방망이: 전방 근접 대상 기절+넉백, 후방 제외', () => {
    const g = setup();
    giveTool(g, 'p0', 'bat');
    const kb = vi.fn();
    g.events.on('knockback', kb);
    const res = useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(true);
    expect(res.hits).toContain('b1');
    expect(g.player('b1')!.stunUntil).toBeGreaterThan(g.state.timeMs);
    expect(kb).toHaveBeenCalled();
    // b2는 20m 거리 → 미적중
    expect(res.hits).not.toContain('b2');
  });

  it('쿨타임 중 재사용 불가', () => {
    const g = setup();
    giveTool(g, 'p0', 'bat');
    expect(useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } }).ok).toBe(true);
    const res = useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('on-cooldown');
    g.tick(2500);
    expect(useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } }).ok).toBe(true);
  });

  it('운반 중 도구 사용 불가', () => {
    const g = setup(34);
    giveTool(g, 'p0', 'bat');
    // b1 기지에 브레인롯 → 훔치기
    const inst = g.spawnOnCarpet('rare')!;
    g.buy('b1', inst.uid);
    g.tick(2500);
    tryPickUp(g, 'p0', inst.uid);
    const res = useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('carrying');
  });

  it('기절한 도둑은 브레인롯을 떨어뜨리고, 피해자가 회수할 수 있다', () => {
    const g = setup(35);
    // b2가 소유한 브레인롯을 p0이 훔친다
    const inst = g.spawnOnCarpet('epic')!;
    g.buy('b2', inst.uid);
    g.tick(2500);
    tryPickUp(g, 'p0', inst.uid);
    expect(inst.location).toBe('carried');
    // b1이 방망이로 p0을 타격 (거리 2m, 전방)
    giveTool(g, 'b1', 'bat');
    g.state.positions.p0 = { x: 0, z: 2 };
    g.state.positions.b1 = { x: 0, z: 0 };
    const res = useTool(g, 'b1', 'bat', { aimDir: { x: 0, z: 1 }, pos: { x: 0, z: 0 } });
    expect(res.hits).toContain('p0');
    expect(g.player('p0')!.carrying).toBeNull();
    expect(inst.location).toBe('dropped');
    // 피해자 b2가 회수 → 자기 기지 복귀
    expect(tryPickUp(g, 'b2', inst.uid).ok).toBe(true);
    expect(arriveOwnBase(g, 'b2').ok).toBe(true);
    expect(inst.ownerId).toBe('b2');
  });

  it('함정: 최대 5개, 밟으면 7초 루트', () => {
    const g = setup(36);
    giveTool(g, 'p0', 'trap');
    for (let i = 0; i < MAX_TRAPS + 2; i++) {
      useTool(g, 'p0', 'trap', { aimDir: aim, pos: { x: i, z: 0 } });
      g.tick(11000); // 쿨타임 우회
    }
    expect(g.state.traps.length).toBe(MAX_TRAPS);
    // b1을 남아있는 함정 위치(가장 오래된 것은 제거됐으므로 x=3)로 이동
    g.state.positions.b1 = { x: 3, z: 0 };
    g.tick(100);
    expect(g.player('b1')!.stunUntil).toBeGreaterThan(g.state.timeMs);
    // 함정 소모
    expect(g.state.traps.length).toBe(MAX_TRAPS - 1);
  });

  it('투명 망토: 은신 상태 부여', () => {
    const g = setup(37);
    giveTool(g, 'p0', 'cloak');
    const res = useTool(g, 'p0', 'cloak', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(true);
    expect(g.player('p0')!.invisUntil).toBeGreaterThan(g.state.timeMs);
  });

  it('디스코볼: 반경 8m 광역 기절', () => {
    const g = setup(38);
    giveTool(g, 'p0', 'disco');
    g.state.positions.b1 = { x: 5, z: 0 };   // 5m → 적중
    g.state.positions.b2 = { x: 0, z: 20 };  // 20m → 미적중
    const res = useTool(g, 'p0', 'disco', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.hits).toContain('b1');
    expect(res.hits).not.toContain('b2');
  });

  it('메두사: 6초 광역 기절', () => {
    const g = setup(39);
    giveTool(g, 'p0', 'medusa');
    const before = g.state.timeMs;
    const res = useTool(g, 'p0', 'medusa', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.hits).toContain('b1');
    expect(g.player('b1')!.stunUntil).toBeGreaterThanOrEqual(before + 6000);
  });

  it('웹 슬링거: 대상 끌어오기+기절, 사거리 밖 거부', () => {
    const g = setup(40);
    giveTool(g, 'p0', 'web');
    const tp = vi.fn();
    g.events.on('teleported', tp);
    const res = useTool(g, 'p0', 'web', { aimDir: aim, pos: { x: 0, z: 0 }, targetId: 'b2' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('out-of-range');
    const res2 = useTool(g, 'p0', 'web', { aimDir: aim, pos: { x: 0, z: 0 }, targetId: 'b1' });
    expect(res2.ok).toBe(true);
    expect(tp).toHaveBeenCalled();
  });

  it('터렛: 60초 후 만료, 침입자에게 자동 기절', () => {
    const g = setup(41);
    giveTool(g, 'p0', 'turret');
    const res = useTool(g, 'p0', 'turret', { aimDir: aim, pos: { x: 2, z: 2 } });
    expect(res.ok).toBe(true);
    expect(g.state.turrets.length).toBe(1);
    // b1이 터렛 사거리(12m)로 진입
    g.state.positions.b1 = { x: 4, z: 2 };
    g.tick(3100);
    expect(g.player('b1')!.stunUntil).toBeGreaterThan(g.state.timeMs);
    // 만료
    g.tick(60000);
    expect(g.state.turrets.length).toBe(0);
  });

  it('순간이동: 위치 갱신+텔레포트 이벤트', () => {
    const g = setup(42);
    giveTool(g, 'p0', 'blink');
    const tp = vi.fn();
    g.events.on('teleported', tp);
    const res = useTool(g, 'p0', 'blink', { aimDir: { x: 1, z: 0 }, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(true);
    expect(g.state.positions.p0.x).toBeCloseTo(8);
    expect(tp).toHaveBeenCalled();
  });

  it('미소유 도구 사용 거부', () => {
    const g = setup(43);
    const res = useTool(g, 'p0', 'bat', { aimDir: aim, pos: { x: 0, z: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-owned');
  });
});

describe('stun과 훔치기 연계', () => {
  it('기절한 도둑은 브레인롯을 떨어뜨리고, 피해자가 회수할 수 있다', () => {
    const g = setup(44);
    const inst = g.spawnOnCarpet('epic')!;
    g.buy('b1', inst.uid);
    g.tick(2500);
    tryPickUp(g, 'p0', inst.uid);
    applyStun(g, 'p0', 3000, 'bat');
    expect(inst.location).toBe('dropped');
    // 피해자 회수 → 자기 기지 복귀
    expect(tryPickUp(g, 'b1', inst.uid).ok).toBe(true);
    expect(arriveOwnBase(g, 'b1').ok).toBe(true);
    expect(inst.ownerId).toBe('b1');
  });
});
