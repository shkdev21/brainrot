import type { Game } from './GameState';
import type { ToolUseContext, PlayerState } from './types';
import { TOOL_BY_ID } from '../data/tools';
import { dropCarried } from './Carry';

// 도구 효과 — 상태이상(기절/감속/은신)은 core가, 시각 효과(넉백 벡터·텔레포트)는 이벤트로.

export const MAX_TRAPS = 5;
export const TRAP_RADIUS = 1.2;
export const TURRET_FIRE_INTERVAL_MS = 2000;
export const TURRET_STUN_MS = 1500;

export interface ToolResult {
  ok: boolean;
  reason?: string;
  /** 적중한 대상 id 목록 */
  hits?: string[];
}

export function applyStun(g: Game, targetId: string, ms: number, reason: string): void {
  const t = g.player(targetId);
  if (!t) return;
  t.stunUntil = Math.max(t.stunUntil, g.state.timeMs + ms);
  // 기절 시 운반 중인 브레인롯 드롭 (원작: 공격받으면 놓침)
  if (t.carrying) dropCarried(g, targetId, reason);
  g.events.emit('stunned', { targetId, until: t.stunUntil, reason });
}

export function dist2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

/** 도구 구매 — 해금(환생) 조건 + 돈 확인 */
export function purchaseTool(g: Game, playerId: string, toolId: string): ToolResult {
  const p = g.player(playerId);
  const def = TOOL_BY_ID.get(toolId);
  if (!p || !def) return { ok: false, reason: 'not-found' };
  if (def.unlockRebirth > p.rebirth) return { ok: false, reason: 'locked' };
  if (p.purchasedTools.includes(toolId)) return { ok: false, reason: 'already-owned' };
  if (p.money < def.price) return { ok: false, reason: 'not-enough-money' };
  p.money -= def.price;
  p.purchasedTools.push(toolId);
  return { ok: true };
}

export function hasTool(p: PlayerState, toolId: string): boolean {
  return p.purchasedTools.includes(toolId);
}

export function isToolReady(g: Game, p: PlayerState, toolId: string): boolean {
  const readyAt = p.toolCooldowns[toolId] ?? 0;
  return g.state.timeMs >= readyAt;
}

export function useTool(
  g: Game,
  playerId: string,
  toolId: string,
  ctx: ToolUseContext,
): ToolResult {
  const p = g.player(playerId);
  const def = TOOL_BY_ID.get(toolId);
  if (!p || !def) return { ok: false, reason: 'not-found' };
  if (!hasTool(p, toolId)) return { ok: false, reason: 'not-owned' };
  const now = g.state.timeMs;
  if (now < p.stunUntil) return { ok: false, reason: 'stunned' };
  if (p.carrying) return { ok: false, reason: 'carrying' };
  if (def.kind !== 'passive' && !isToolReady(g, p, toolId)) {
    return { ok: false, reason: 'on-cooldown' };
  }
  if (def.kind === 'passive') return { ok: false, reason: 'passive-tool' };

  const hits: string[] = [];
  const myPos = g.state.positions[playerId] ?? ctx.pos;

  const others = g.state.players.filter((o) => o.id !== playerId);

  switch (def.kind) {
    case 'melee': {
      const range2 = def.range * def.range;
      for (const o of others) {
        const opos = g.state.positions[o.id];
        if (!opos) continue;
        if (dist2(myPos, opos) > range2) continue;
        // 조준 방향 부합(전방 약 200도 — 휘두르기 관대한 판정)
        const dx = opos.x - myPos.x;
        const dz = opos.z - myPos.z;
        const dot = dx * ctx.aimDir.x + dz * ctx.aimDir.z;
        if (dot < -0.35) continue;
        applyStun(g, o.id, def.powerMs, toolId);
        g.events.emit('knockback', { targetId: o.id, dir: ctx.aimDir, force: 12 });
        hits.push(o.id);
      }
      break;
    }
    case 'trap': {
      // 최대 5개 — 오래된 것 제거
      const mine = g.state.traps.filter((t) => t.ownerId === playerId);
      if (mine.length >= MAX_TRAPS) {
        const oldest = mine.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0];
        const idx = g.state.traps.indexOf(oldest);
        if (idx >= 0) g.state.traps.splice(idx, 1);
      }
      const trapId = `t${++g.state.seq}`;
      g.state.traps.push({ id: trapId, ownerId: playerId, pos: { ...ctx.pos }, armed: true });
      g.events.emit('trap-placed', { trapId, ownerId: playerId, pos: { ...ctx.pos } });
      break;
    }
    case 'cloak': {
      p.invisUntil = now + def.powerMs;
      g.events.emit('invisible', { playerId, until: p.invisUntil });
      break;
    }
    case 'aoeStun': {
      const r2 = def.range * def.range;
      for (const o of others) {
        const opos = g.state.positions[o.id];
        if (!opos || dist2(myPos, opos) > r2) continue;
        applyStun(g, o.id, def.powerMs, toolId);
        hits.push(o.id);
      }
      break;
    }
    case 'pull': {
      const target = ctx.targetId ? g.player(ctx.targetId) : undefined;
      if (!target) return { ok: false, reason: 'no-target' };
      const tpos = g.state.positions[target.id];
      if (!tpos || dist2(myPos, tpos) > def.range * def.range) {
        return { ok: false, reason: 'out-of-range' };
      }
      applyStun(g, target.id, def.powerMs, toolId);
      const to = { x: myPos.x + ctx.aimDir.x * 2, z: myPos.z + ctx.aimDir.z * 2 };
      g.events.emit('teleported', { playerId: target.id, from: tpos, to });
      hits.push(target.id);
      break;
    }
    case 'turret': {
      const turretId = `u${++g.state.seq}`;
      g.state.turrets.push({
        id: turretId,
        ownerId: playerId,
        pos: { ...ctx.pos },
        expiresAt: now + def.powerMs,
        nextFireAt: now + 3000,
      });
      g.events.emit('turret-placed', { turretId, ownerId: playerId, pos: { ...ctx.pos } });
      break;
    }
    case 'dash': {
      g.events.emit('dash', { playerId, dir: ctx.aimDir, distance: def.range });
      const range2 = (def.range + 2) ** 2;
      for (const o of others) {
        const opos = g.state.positions[o.id];
        if (!opos) continue;
        if (dist2(myPos, opos) > range2) continue;
        const dx = opos.x - myPos.x;
        const dz = opos.z - myPos.z;
        const dot = dx * ctx.aimDir.x + dz * ctx.aimDir.z;
        if (dot < 0) continue;
        applyStun(g, o.id, def.powerMs, toolId);
        g.events.emit('knockback', { targetId: o.id, dir: ctx.aimDir, force: 20 });
        hits.push(o.id);
      }
      break;
    }
    case 'blink': {
      const to = {
        x: myPos.x + ctx.aimDir.x * def.range,
        z: myPos.z + ctx.aimDir.z * def.range,
      };
      g.state.positions[playerId] = to;
      g.events.emit('teleported', { playerId, from: myPos, to });
      break;
    }
  }

  p.toolCooldowns[toolId] = now + def.cooldownMs;
  g.events.emit('tool-used', { playerId, toolId });
  g.events.emit('tool-cooldown', { playerId, toolId, readyAt: p.toolCooldowns[toolId] });
  return { ok: true, hits };
}

/** 함정/터렛 업데이트 — Game.tick에서 호출 */
export function updateDeployables(g: Game): void {
  const now = g.state.timeMs;

  // 함정 발동 — 한 플레이어는 틱당 최대 1개만 밟는다
  const triggered: number[] = [];
  const victims = new Set<string>();
  for (let i = 0; i < g.state.traps.length; i++) {
    const trap = g.state.traps[i];
    if (!trap.armed) continue;
    for (const p of g.state.players) {
      if (p.id === trap.ownerId || victims.has(p.id)) continue;
      const pos = g.state.positions[p.id];
      if (!pos) continue;
      if (dist2(pos, trap.pos) <= TRAP_RADIUS * TRAP_RADIUS) {
        trap.armed = false;
        triggered.push(i);
        victims.add(p.id);
        applyStun(g, p.id, TOOL_BY_ID.get('trap')!.powerMs, 'trap');
        g.events.emit('trap-triggered', { trapId: trap.id, victimId: p.id });
        break;
      }
    }
  }
  for (let i = triggered.length - 1; i >= 0; i--) {
    g.state.traps.splice(triggered[i], 1);
  }

  // 터렛 발사/만료
  const expired: number[] = [];
  for (let i = 0; i < g.state.turrets.length; i++) {
    const t = g.state.turrets[i];
    if (now >= t.expiresAt) {
      expired.push(i);
      g.events.emit('turret-expired', { turretId: t.id });
      continue;
    }
    if (now < t.nextFireAt) continue;
    const range2 = TOOL_BY_ID.get('turret')!.range ** 2;
    let fired = false;
    for (const p of g.state.players) {
      if (p.id === t.ownerId) continue;
      const pos = g.state.positions[p.id];
      if (!pos || dist2(pos, t.pos) > range2) continue;
      applyStun(g, p.id, TURRET_STUN_MS, 'turret');
      g.events.emit('turret-fired', { turretId: t.id, targetId: p.id });
      fired = true;
      break; // 발사 간 하나만
    }
    if (fired) t.nextFireAt = now + TURRET_FIRE_INTERVAL_MS;
  }
  for (let i = expired.length - 1; i >= 0; i--) {
    g.state.turrets.splice(expired[i], 1);
  }
}
