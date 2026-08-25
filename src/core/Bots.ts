import type { Game } from './GameState';
import type { PlayerState, Persona, Vec2 } from './types';
import { brainrotById } from '../data/brainrots';
import { TOOL_BY_ID } from '../data/tools';
import { makeRng, type Rng } from './rng';
import { canEnterBase, isBaseLocked } from './BaseLock';
import { baseCenter, dist2d, inBaseZone, type P2 } from './Layout';
import { instanceIncome } from './Economy';

// 봇 AI — 성격 3종(farmer/raider/guardian) × 스킬 파라미터.
// update()는 상태를 읽어 "의도"만 반환. 적용은 통합 계층이 수행.

export interface BotIntent {
  moveTo: Vec2 | null;
  buySpawnUid?: string;
  buyToolId?: string;
  pickUpUid?: string;
  lockBase?: boolean;
  useTool?: { toolId: string; targetId?: string };
}

/** 성격별 도구 구매 우선순위 */
const TOOL_PRIORITY: Record<Persona, string[]> = {
  farmer: ['bat'],
  raider: ['bat', 'cloak', 'sword'],
  guardian: ['bat', 'trap', 'medusa', 'turret'],
};

/** 습격 재시도 쿨타임 (스킬이 높으면 짧아짐) */
export function raidCooldownMs(skill: number): number {
  return 60000 - skill * 30000; // 30s~60s
}

export class BotBrain {
  readonly playerId: string;
  private rng: Rng;
  private nextThinkAt = 0;
  private raidTargetBase: number | null = null;
  private raidAgainAt = 0;
  private cached: BotIntent = { moveTo: null };

  constructor(playerId: string, seed: number) {
    this.playerId = playerId;
    this.rng = makeRng(seed);
  }

  /** 통합 계층이 매 순간 리셋 — 테스트용 */
  resetMemory(): void {
    this.raidTargetBase = null;
    this.raidAgainAt = 0;
    this.nextThinkAt = 0;
  }

  update(g: Game): BotIntent {
    const me = g.player(this.playerId);
    const pos = g.state.positions[this.playerId];
    if (!me || !me.isBot) return { moveTo: null };
    if (g.state.timeMs < this.nextThinkAt) return this.cached;
    // 반응 지연: 스킬이 높으면 빠르게 재판단 (0.6s~2.5s)
    const reactMs = 2500 - me.skill * 1900;
    this.nextThinkAt = g.state.timeMs + reactMs;
    this.cached = this.think(g, me, pos);
    return this.cached;
  }

  private think(g: Game, me: PlayerState, pos: P2 | undefined): BotIntent {
    if (!pos) return { moveTo: null };
    if (g.state.timeMs < me.stunUntil) return { moveTo: null };

    const home = baseCenter(me.baseId);

    // 침입자 탐지 (은신 중이면 보이지 않음)
    const intruders = g.state.players.filter((o) => {
      if (o.id === me.id) return false;
      if (g.state.timeMs < o.invisUntil) return false;
      const opos = g.state.positions[o.id];
      return !!opos && inBaseZone(opos, me.baseId);
    });

    // 1) 운반 중 — 무조건 귀환
    if (me.carrying) {
      const intent: BotIntent = { moveTo: home };
      if (dist2d(pos, home) < 4) intent.lockBase = true;
      return intent;
    }

    // 2) 자기 기지 침입자 — 성격별 대응
    if (intruders.length > 0) {
      const target = intruders[0];
      const tpos = g.state.positions[target.id];
      // 가진 공격 도구 중 가장 강한 것
      const weapon = ['medusa', 'bat']
        .filter((t) => me.purchasedTools.includes(t))
        .sort((a, b) => TOOL_BY_ID.get(b)!.price - TOOL_BY_ID.get(a)!.price)[0];
      const intent: BotIntent = { moveTo: tpos ?? home };
      if (weapon && tpos && dist2d(pos, tpos) < TOOL_BY_ID.get(weapon)!.range) {
        intent.useTool = { toolId: weapon, targetId: target.id };
      }
      // 수비형/집에 있으면 잠금
      if (me.persona !== 'raider' && dist2d(pos, home) < 8) {
        intent.lockBase = true;
      }
      return intent;
    }

    // 3) 성격별 행동
    if (me.persona === 'guardian') {
      return this.thinkGuardian(g, me, pos, home);
    }
    if (me.persona === 'raider') {
      return this.thinkRaider(g, me, pos, home);
    }
    return this.thinkFarmer(g, me, pos);
  }

  // ── 경제형: 카펫 근처에서 구매만 ─────────────────────────
  private thinkFarmer(g: Game, me: PlayerState, pos: P2): BotIntent {
    const intent: BotIntent = { moveTo: null };
    const buy = this.bestAffordableSpawn(g, me);
    if (buy) {
      intent.buySpawnUid = buy.uid;
      if (Math.abs(pos.x) > 8 || Math.abs(pos.z) > 24) {
        intent.moveTo = { x: 0, z: 0 };
      }
    }
    const tool = this.toolToBuy(g, me);
    if (tool) intent.buyToolId = tool;
    return intent;
  }

  // ── 수비형: 기지 순찰 + 가끔 구매 ────────────────────────
  private thinkGuardian(g: Game, me: PlayerState, pos: P2, home: P2): BotIntent {
    const intent: BotIntent = { moveTo: null };
    const tool = this.toolToBuy(g, me);
    if (tool) intent.buyToolId = tool;

    // 여유 자금이면 근처 카펫 스폰 구매 (집 근처에 있을 때만)
    const buy = this.bestAffordableSpawn(g, me);
    if (buy && me.money > brainrotById.get(buy.defId)!.price * 3) {
      intent.buySpawnUid = buy.uid;
    }

    // 순찰: 기지 주변 배회
    const a = this.rng() * Math.PI * 2;
    intent.moveTo = { x: home.x + Math.sin(a) * 5, z: home.z + Math.cos(a) * 5 };
    return intent;
  }

  // ── 약탈형: 부유 기지 습격 ───────────────────────────────
  private thinkRaider(g: Game, me: PlayerState, pos: P2, home: P2): BotIntent {
    const intent: BotIntent = { moveTo: null };
    const tool = this.toolToBuy(g, me);
    if (tool) intent.buyToolId = tool;

    // 습격 쿨타임 전이면 경제
    if (g.state.timeMs < this.raidAgainAt) {
      return this.thinkFarmer(g, me, pos);
    }

    // 목표 선정: 잠기지 않은 타인 기지 중 (총 수입 / 거리) 최대
    let best: { baseId: number; score: number; lootUid: string | null } | null = null;
    for (const other of g.state.players) {
      if (other.id === me.id) continue;
      const loot = g.state.brainrots.filter(
        (i) => i.ownerId === other.id && i.location === 'base',
      );
      if (loot.length === 0) continue;
      if (!canEnterBase(g, me.id, other.baseId)) continue;
      const targetBase = other.baseId;
      if (isBaseLocked(g, targetBase)) continue;
      const center = baseCenter(targetBase);
      const d = dist2d(pos, center);
      if (d < 4) {
        // 도착 — 가장 가치 있는 것 픽업
        let bestLoot = loot[0];
        for (const l of loot) {
          if (instanceIncome(l) > instanceIncome(bestLoot)) bestLoot = l;
        }
        intent.pickUpUid = bestLoot.uid;
        intent.moveTo = center;
        return intent;
      }
      const totalIncome = loot.reduce((s, l) => s + instanceIncome(l), 0);
      const score = totalIncome / (1 + d);
      if (!best || score > best.score) {
        best = { baseId: targetBase, score, lootUid: null };
      }
    }

    if (!best) {
      // 습격할 곳 없음 — 경제 행동 후 재시도
      this.raidAgainAt = g.state.timeMs + 15000;
      return this.thinkFarmer(g, me, pos);
    }

    this.raidTargetBase = best.baseId;
    intent.moveTo = baseCenter(best.baseId);
    return intent;
  }

  /** 통지: 습격 실패/성공 종료 (통합 계층이 호출) */
  notifyRaidEnded(g: Game): void {
    this.raidAgainAt = g.state.timeMs + raidCooldownMs(0.5);
    this.raidTargetBase = null;
  }

  /** 살 수 있는 카펫 스폰 중 수입 대비 최선 */
  private bestAffordableSpawn(g: Game, me: PlayerState): { uid: string; defId: string } | null {
    const owned = g.state.brainrots.filter(
      (i) => i.ownerId === me.id && i.location === 'base',
    ).length;
    if (owned >= me.slots - 1) return null;
    let best: { uid: string; defId: string } | null = null;
    let bestIncome = 0;
    for (const inst of g.state.brainrots) {
      if (inst.location !== 'carpet') continue;
      const def = brainrotById.get(inst.defId);
      if (!def || def.price > me.money) continue;
      const income = instanceIncome(inst);
      if (income > bestIncome) {
        bestIncome = income;
        best = { uid: inst.uid, defId: inst.defId };
      }
    }
    return best;
  }

  /** 성격 우선순위에 따라 살 도구 */
  private toolToBuy(g: Game, me: PlayerState): string | null {
    const priority = TOOL_PRIORITY[me.persona ?? 'farmer'];
    for (const toolId of priority) {
      const def = TOOL_BY_ID.get(toolId)!;
      if (me.purchasedTools.includes(toolId)) continue;
      if (def.unlockRebirth > me.rebirth) continue;
      if (me.money < def.price * 3) continue; // 여유분으로만 구매
      return toolId;
    }
    return null;
  }
}
