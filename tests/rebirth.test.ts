import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/GameState';
import { canRebirth, doRebirth, toolsUnlockedAt, nextRebirthDef } from '../src/core/Rebirth';
import { brainrotById } from '../src/data/brainrots';
import { REBIRTHS } from '../src/data/rebirths';
import { TOOL_BY_ID } from '../src/data/tools';

/** 재료 + 돈을 갖춘 상태로 만든다 */
function readyForFirst(g: Game) {
  const p = g.player('p0')!;
  const r1 = REBIRTHS[0];
  p.money = 1e12; // 구매 가능하게 먼저 지급
  for (const id of r1.requiredBrainrotIds) {
    const inst = g.spawnOnCarpet(brainrotById.get(id)!.rarity)!;
    // 강제로 해당 def로 교체
    inst.defId = id;
    g.buy('p0', inst.uid);
  }
  g.tick(2500);
  p.money = r1.requiredMoney + 123;
  return p;
}

describe('canRebirth', () => {
  it('재료·돈 부족 시 거부와 사유 목록', () => {
    const g = new Game({ seed: 51, startingMoney: 100 });
    const check = canRebirth(g, 'p0');
    expect(check.ok).toBe(false);
    expect(check.missing.length).toBe(3); // 브레인롯 2 + 돈 1
  });

  it('조건 충족 시 ok', () => {
    const g = new Game({ seed: 52, startingMoney: 100 });
    readyForFirst(g);
    const check = canRebirth(g, 'p0');
    expect(check.ok).toBe(true);
    expect(check.nextLevel).toBe(1);
  });
});

describe('doRebirth', () => {
  it('환생 후 브레인롯·돈 초기화, 슬롯 증가, 도구 해금', () => {
    const g = new Game({ seed: 53, startingMoney: 100 });
    readyForFirst(g);
    const res = doRebirth(g, 'p0');
    expect(res.ok).toBe(true);
    const p = g.player('p0')!;
    expect(p.rebirth).toBe(1);
    expect(p.money).toBe(0);
    expect(p.slots).toBe(14); // 10 + 4
    expect(g.state.brainrots.filter((i) => i.ownerId === 'p0').length).toBe(0);
    // 1환생 → boots 구매 가능
    expect(toolsUnlockedAt(1)).toContain('boots');
    expect(TOOL_BY_ID.get('medusa')!.unlockRebirth).toBeGreaterThan(1);
  });

  it('2환생에서 2층 해금', () => {
    const g = new Game({ seed: 54, startingMoney: 1e9 });
    const p = g.player('p0')!;
    // 1~2단계 연속 수행
    for (let lv = 0; lv < 2; lv++) {
      const def = REBIRTHS[lv];
      p.money = 1e12;
      for (const id of def.requiredBrainrotIds) {
        const inst = g.spawnOnCarpet(brainrotById.get(id)!.rarity)!;
        inst.defId = id;
        g.buy('p0', inst.uid);
      }
      g.tick(2500);
      p.money = def.requiredMoney;
      expect(doRebirth(g, 'p0').ok).toBe(true);
    }
    expect(p.rebirth).toBe(2);
    expect(g.base(0)!.unlockedFloors).toBe(2);
  });

  it('5환생에서 3층 해금', () => {
    const g = new Game({ seed: 55, startingMoney: 1e12 });
    const p = g.player('p0')!;
    for (let lv = 0; lv < 5; lv++) {
      const def = REBIRTHS[lv];
      p.money = 1e12;
      for (const id of def.requiredBrainrotIds) {
        const inst = g.spawnOnCarpet(brainrotById.get(id)!.rarity)!;
        inst.defId = id;
        g.buy('p0', inst.uid);
      }
      g.tick(2500);
      p.money = def.requiredMoney;
      expect(doRebirth(g, 'p0').ok).toBe(true);
    }
    expect(p.rebirth).toBe(5);
    expect(g.base(0)!.unlockedFloors).toBe(3);
    expect(p.slots).toBe(30); // 10 + 4×5
    expect(toolsUnlockedAt(5)).toContain('blink');
  });

  it('최대 환생 도달 후 거부', () => {
    const g = new Game({ seed: 56, startingMoney: 1e12 });
    const p = g.player('p0')!;
    for (let lv = 0; lv < 5; lv++) {
      const def = REBIRTHS[lv];
      p.money = 1e12;
      for (const id of def.requiredBrainrotIds) {
        const inst = g.spawnOnCarpet(brainrotById.get(id)!.rarity)!;
        inst.defId = id;
        g.buy('p0', inst.uid);
      }
      g.tick(2500);
      p.money = def.requiredMoney;
      doRebirth(g, 'p0');
    }
    const check = canRebirth(g, 'p0');
    expect(check.ok).toBe(false);
    expect(nextRebirthDef(p)).toBeNull();
  });

  it('환생 이벤트 발행', () => {
    const g = new Game({ seed: 57, startingMoney: 1e8 });
    readyForFirst(g);
    let fired = 0;
    g.events.on('rebirth-done', () => fired++);
    doRebirth(g, 'p0');
    expect(fired).toBe(1);
  });
});
