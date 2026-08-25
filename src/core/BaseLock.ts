import type { Game } from './GameState';

// 기지 잠금 — 20초 지속, 45초 쿨타임. 잠금 중 타인 침입 불가.

export const LOCK_DURATION_MS = 20000;
export const LOCK_COOLDOWN_MS = 45000;

export function lockBase(g: Game, playerId: string): { ok: boolean; reason?: string } {
  const p = g.player(playerId);
  if (!p) return { ok: false, reason: 'no-player' };
  const base = g.base(p.baseId);
  if (!base) return { ok: false, reason: 'no-base' };
  const now = g.state.timeMs;
  if (now < base.lockedUntil) return { ok: false, reason: 'already-locked' };
  if (now < base.lockCooldownUntil) return { ok: false, reason: 'on-cooldown' };

  base.lockedUntil = now + LOCK_DURATION_MS;
  base.lockCooldownUntil = now + LOCK_COOLDOWN_MS;
  base.notifiedUnlock = false;
  g.events.emit('locked', { baseId: base.id, ownerId: playerId, until: base.lockedUntil });
  return { ok: true };
}

/** 잠금 해제 전환 감지 — Game.tick에서 호출 */
export function updateLocks(g: Game): void {
  const now = g.state.timeMs;
  for (const base of g.state.bases) {
    if (!base.notifiedUnlock && base.lockedUntil > 0 && now >= base.lockedUntil) {
      base.notifiedUnlock = true;
      g.events.emit('unlocked', { baseId: base.id });
    }
  }
}

/** 침입 가능 여부 — 렌더 계층의 문 통과 판정에서 호출 */
export function canEnterBase(g: Game, playerId: string, baseId: number): boolean {
  const base = g.base(baseId);
  if (!base) return true;
  if (g.state.timeMs >= base.lockedUntil) return true;
  return base.ownerId === playerId;
}

export function isBaseLocked(g: Game, baseId: number): boolean {
  const base = g.base(baseId);
  return !!base && g.state.timeMs < base.lockedUntil;
}
