import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/GameState';
import { BotBrain } from '../src/core/Bots';
import { baseCenter, inBaseZone } from '../src/core/Layout';
import { lockBase } from '../src/core/BaseLock';
import { tryPickUp } from '../src/core/Carry';

function setup(seed = 61) {
  const g = new Game({ seed, startingMoney: 5000 });
  // 모든 플레이어 위치: 자기 기지 근처
  for (let i = 0; i < 8; i++) {
    const c = baseCenter(i);
    g.state.positions[i === 0 ? 'p0' : `b${i}`] = { x: c.x, z: c.z };
  }
  return g;
}

function brainFor(g: Game, id: string): BotBrain {
  return new BotBrain(id, (g.state.seed || 1) * 977 + Number(id.replace(/\D/g, '')));
}

describe('farmer bot', () => {
  it('살 수 있는 스폰이 있으면 구매 의도', () => {
    const g = setup(62);
    const brain = brainFor(g, 'b6'); // farmer (b6, b7)
    const inst = g.spawnOnCarpet('common')!;
    g.tick(1); // 시간 진행
    const intent = brain.update(g);
    expect(intent.buySpawnUid).toBe(inst.uid);
  });

  it('여유 자금이면 도구 구매 의도', () => {
    const g = setup(63);
    g.player('b6')!.money = 5000;
    const brain = brainFor(g, 'b6');
    brain.update(g);
    const intent = brain.update(g);
    expect(intent.buyToolId).toBe('bat');
  });
});

describe('raider bot', () => {
  it('부유한 타인 기지를 목표로 이동', () => {
    const g = setup(64);
    // b2(수비 없음) 기지에 값진 브레인롯 배치
    g.player('b2')!.money = 1e6;
    const inst = g.spawnOnCarpet('legendary')!;
    g.buy('b2', inst.uid);
    g.tick(2500);
    const brain = brainFor(g, 'b1'); // b1 = raider
    const intent = brain.update(g);
    expect(intent.moveTo).not.toBeNull();
    const target = baseCenter(2);
    expect(intent.moveTo!.x).toBeCloseTo(target.x, 0);
    expect(intent.moveTo!.z).toBeCloseTo(target.z, 0);
  });

  it('잠긴 기지는 회피한다', () => {
    const g = setup(65);
    g.player('b2')!.money = 1e6;
    const inst = g.spawnOnCarpet('legendary')!;
    g.buy('b2', inst.uid);
    g.tick(2500);
    lockBase(g, 'b2'); // b2 기지 잠금
    // 유일한 약탈처가 잠김 → 목표 없음 → 농사 모드(카펫 방향)로 전환
    const brain = brainFor(g, 'b1');
    const intent = brain.update(g);
    const locked = baseCenter(2);
    const isLockedBase =
      intent.moveTo !== null &&
      Math.abs(intent.moveTo.x - locked.x) < 5 &&
      Math.abs(intent.moveTo.z - locked.z) < 5;
    expect(isLockedBase).toBe(false);
    expect(intent.pickUpUid).toBeUndefined();
  });

  it('목표 기지 도착 시 가장 가치 있는 로트 픽업 의도', () => {
    const g = setup(66);
    g.player('b2')!.money = 1e6;
    const cheap = g.spawnOnCarpet('common')!;
    g.buy('b2', cheap.uid);
    const prized = g.spawnOnCarpet('epic')!;
    g.buy('b2', prized.uid);
    g.tick(2500);
    // b1(raider)을 b2 기지로 이동
    const c = baseCenter(2);
    g.state.positions.b1 = { x: c.x, z: c.z };
    const brain = brainFor(g, 'b1');
    const intent = brain.update(g);
    expect(intent.pickUpUid).toBe(prized.uid);
  });

  it('운반 중이면 자기 기지로 귀환', () => {
    const g = setup(67);
    g.player('b2')!.money = 1e6;
    const inst = g.spawnOnCarpet('rare')!;
    g.buy('b2', inst.uid);
    g.tick(2500);
    g.state.positions.b1 = baseCenter(2);
    tryPickUp(g, 'b1', inst.uid);
    const brain = brainFor(g, 'b1');
    const intent = brain.update(g);
    const home = baseCenter(1);
    expect(intent.moveTo!.x).toBeCloseTo(home.x, 0);
    expect(intent.moveTo!.z).toBeCloseTo(home.z, 0);
  });
});

describe('guardian bot', () => {
  it('침입자 발견 시 추격+공격 도구 사용', () => {
    const g = setup(68);
    const guard = g.player('b4')!; // guardian (b4, b5)
    guard.purchasedTools.push('bat');
    // p0이 b4 기지 침입
    const gc = baseCenter(4);
    g.state.positions.p0 = { x: gc.x + 1, z: gc.z };
    g.state.positions.b4 = { x: gc.x, z: gc.z };
    g.state.positions.p0 = inBaseZone(g.state.positions.p0, 4) ? g.state.positions.p0 : g.state.positions.p0;
    const brain = brainFor(g, 'b4');
    const intent = brain.update(g);
    expect(intent.moveTo).toEqual(g.state.positions.p0);
    expect(intent.useTool?.toolId).toBe('bat');
    expect(intent.useTool?.targetId).toBe('p0');
  });

  it('은신한 침입자는 감지 못한다', () => {
    const g = setup(69);
    const guard = g.player('b4')!;
    guard.purchasedTools.push('bat');
    const gc = baseCenter(4);
    g.state.positions.p0 = { x: gc.x, z: gc.z };
    g.player('p0')!.invisUntil = g.state.timeMs + 10000;
    const brain = brainFor(g, 'b4');
    const intent = brain.update(g);
    expect(intent.useTool).toBeUndefined();
  });
});

describe('bot integration with raid end', () => {
  it('notifyRaidEnded 후 쿨타임 동안 농사 모드', () => {
    const g = setup(70);
    g.player('b2')!.money = 1e6;
    const inst = g.spawnOnCarpet('legendary')!;
    g.buy('b2', inst.uid);
    g.tick(2500);
    const brain = brainFor(g, 'b1');
    brain.notifyRaidEnded(g);
    const intent = brain.update(g);
    // 쿨타임 → farmer 행동: 이동 없음(집 근처) & 다른 약탈 의도 없음
    expect(intent.pickUpUid).toBeUndefined();
  });
});
