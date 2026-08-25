import type { Game } from './GameState';
import type { BrainrotInstance } from './types';

// 훔치기 코어 규칙 — 원작: 들면 이속 감소+도구 불가, 내 기지 도착 시 소유권 이전,
// 기절 시 드롭, 주인 없는(버려진) 브레인롯은 때리면 소멸.

/** 드롭된 브레인롯 지속 시간 */
export const DROPPED_TTL_MS = 120000;
/** 소유권 이전 후 슬롯까지 걷는 시간 */
export const TRANSFER_WALK_MS = 1000;

export interface CarryResult {
  ok: boolean;
  reason?: string;
}

export function tryPickUp(g: Game, playerId: string, uid: string): CarryResult {
  const p = g.player(playerId);
  const inst = g.instance(uid);
  if (!p) return { ok: false, reason: 'no-player' };
  if (!inst) return { ok: false, reason: 'no-instance' };
  if (p.carrying) return { ok: false, reason: 'already-carrying' };
  if (g.state.timeMs < p.stunUntil) return { ok: false, reason: 'stunned' };

  if (inst.location === 'dropped') {
    // 무주공해 — 자유 획득
    if (inst.ownerId === playerId) {
      // 내 것이었던 것도 그냥 회수
    }
    inst.ownerId = null;
    inst.location = 'carried';
    inst.earning = false;
    p.carrying = uid;
    g.events.emit('steal-started', { uid, thiefId: playerId, fromBaseId: -1 });
    return { ok: true };
  }

  if (inst.location !== 'base') return { ok: false, reason: 'not-in-base' };
  if (inst.ownerId === playerId) return { ok: false, reason: 'own-brainrot' };

  // 소유자 기지가 잠겨 있으면(침입자 관점) 픽업 불가 — 침입 자체가 차단됐어야 함
  const slot = inst.slot;
  if (slot) {
    const base = g.base(slot.baseId);
    if (base && g.state.timeMs < base.lockedUntil) {
      return { ok: false, reason: 'base-locked' };
    }
  }

  const fromBaseId = slot?.baseId ?? -1;
  inst.ownerId = null;
  inst.location = 'carried';
  inst.slot = null;
  inst.earning = false;
  inst.walkingUntil = 0;
  p.carrying = uid;
  g.events.emit('steal-started', { uid, thiefId: playerId, fromBaseId });
  return { ok: true };
}

/** 운반 중 지속 페널티 — 매 틱 호출: 이속 감소 유지 (도구 사용 불가는 isCarrying로 판단) */
export function updateCarry(g: Game, dtMs: number): void {
  const now = g.state.timeMs;
  for (const p of g.state.players) {
    if (p.carrying && now >= p.stunUntil) {
      p.slowUntil = Math.max(p.slowUntil, now + dtMs + 50);
    }
  }
}

export function isCarrying(g: Game, playerId: string): boolean {
  return !!g.player(playerId)?.carrying;
}

/** 내 기지 영역 진입 시 호출 — 소유권 이전 */
export function arriveOwnBase(g: Game, playerId: string): CarryResult {
  const p = g.player(playerId);
  if (!p?.carrying) return { ok: false, reason: 'not-carrying' };
  const inst = g.instance(p.carrying);
  if (!inst) {
    p.carrying = null;
    return { ok: false, reason: 'instance-lost' };
  }
  // 풀슬롯이면 계속 들고 있어야 함
  const owned = g.state.brainrots.filter(
    (i) => i.ownerId === playerId && i.location === 'base',
  ).length;
  if (owned >= p.slots) return { ok: false, reason: 'base-full' };

  inst.ownerId = playerId;
  inst.location = 'base';
  inst.slot = g.reserveSlot(p);
  inst.walkingUntil = g.state.timeMs + TRANSFER_WALK_MS;
  inst.earning = false;
  p.carrying = null;
  g.events.emit('ownership-transferred', { uid: inst.uid, newOwnerId: playerId });
  return { ok: true };
}

/** 기절 등으로 강제 드롭 */
export function dropCarried(g: Game, playerId: string, reason: string): CarryResult {
  const p = g.player(playerId);
  if (!p?.carrying) return { ok: false, reason: 'not-carrying' };
  const inst = g.instance(p.carrying);
  p.carrying = null;
  if (!inst) return { ok: false, reason: 'instance-lost' };
  inst.location = 'dropped';
  inst.ownerId = null;
  inst.slot = null;
  inst.earning = false;
  inst.walkingUntil = 0;
  inst.expiresAt = g.state.timeMs + DROPPED_TTL_MS;
  g.events.emit('dropped', { uid: inst.uid, playerId });
  if (reason) {
    // reason은 로그/디버그용 — 별도 이벤트 없음
  }
  return { ok: true };
}

/** 드롭된 브레인롯 만료 — Game.tick에서 호출 */
export function updateDropped(g: Game): void {
  const now = g.state.timeMs;
  const expired = g.state.brainrots.filter(
    (i) => i.location === 'dropped' && now >= i.expiresAt,
  );
  for (const inst of expired) {
    g.removeInstance(inst.uid);
    g.events.emit('despawned', { uid: inst.uid });
  }
}

/** 원작 규칙: 무주공해 브레인롯을 때리면 증발 */
export function smashDropped(g: Game, uid: string): boolean {
  const inst = g.instance(uid);
  if (!inst || inst.location !== 'dropped') return false;
  g.removeInstance(uid);
  g.events.emit('despawned', { uid });
  return true;
}

/** 근처 드롭 아이템 타격 판정용 */
export function nearestDropped(g: Game, pos: { x: number; z: number }, radius: number): BrainrotInstance | null {
  let best: BrainrotInstance | null = null;
  let bestD = radius * radius;
  for (const inst of g.state.brainrots) {
    if (inst.location !== 'dropped') continue;
    // 드롭 위치는 렌더 계측이 소유 — 여기선 slot 위치 대신 임시 저장소 사용
    const dPos = droppedPositions.get(inst.uid);
    if (!dPos) continue;
    const d = (dPos.x - pos.x) ** 2 + (dPos.z - pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = inst;
    }
  }
  return best;
}

/** 드롭 위치 임시 저장 (render가 drop 이벤트 수신 시 기록) */
export const droppedPositions = new Map<string, { x: number; z: number }>();
