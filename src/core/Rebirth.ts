import type { Game } from './GameState';
import type { PlayerState } from './types';
import { REBIRTHS, MAX_REBIRTH, SLOTS_PER_REBIRTH } from '../data/rebirths';
import { TOOLS } from '../data/tools';

// 환생 — 재산·브레인롯 초기화, 슬롯+도구 해금, 층 확장.
// 원작 규칙: 2환생 2층, (우리 체계) 5환생 3층.

export interface RebirthCheck {
  ok: boolean;
  /** 달성 못한 조건 설명 (UI 표시용) */
  missing: string[];
  nextLevel: number;
}

export function canRebirth(g: Game, playerId: string): RebirthCheck {
  const p = g.player(playerId);
  if (!p) return { ok: false, missing: ['플레이어 없음'], nextLevel: 0 };
  if (p.rebirth >= MAX_REBIRTH) {
    return { ok: false, missing: ['최대 환생 달성'], nextLevel: p.rebirth };
  }
  const def = REBIRTHS[p.rebirth];
  const missing: string[] = [];

  for (const needId of def.requiredBrainrotIds) {
    const has = g.state.brainrots.some(
      (i) =>
        i.ownerId === playerId &&
        i.defId === needId &&
        i.location === 'base',
    );
    if (!has) missing.push(`브레인롯 필요: ${needId}`);
  }
  if (p.money < def.requiredMoney) {
    missing.push(`돈 부족 (${def.requiredMoney - p.money} 더 필요)`);
  }
  return { ok: missing.length === 0, missing, nextLevel: p.rebirth + 1 };
}

export function doRebirth(g: Game, playerId: string): { ok: boolean; reason?: string } {
  const p = g.player(playerId);
  if (!p) return { ok: false, reason: 'no-player' };
  const check = canRebirth(g, playerId);
  if (!check.ok) return { ok: false, reason: 'requirements-not-met' };

  const def = REBIRTHS[p.rebirth];

  // 재산·브레인롯 초기화 — 기지 슬롯의 것 전부 제거 (운반 중인 것도)
  const toRemove = g.state.brainrots.filter((i) => i.ownerId === playerId);
  for (const inst of toRemove) {
    g.removeInstance(inst.uid);
  }
  p.carrying = null;
  p.money = 0;
  p.rebirth += 1;
  p.slots += SLOTS_PER_REBIRTH;

  // 층 해금: 2환생 2층, 5환생 3층
  const base = g.base(p.baseId);
  if (base) {
    if (p.rebirth >= 2) base.unlockedFloors = Math.max(base.unlockedFloors, 2) as 1 | 2 | 3;
    if (p.rebirth >= 5) base.unlockedFloors = 3;
  }

  // 도구 해금 — unlockRebirth가 환생 이하면 상점에서 구매 가능 (purchaseTool이 검사)
  g.events.emit('rebirth-done', { playerId, level: p.rebirth });
  return { ok: true };
}

/** 환생 레벨별 해금 도구 id 목록 (상점 UI용) */
export function toolsUnlockedAt(rebirthLevel: number): string[] {
  return TOOLS.filter((t) => t.unlockRebirth <= rebirthLevel).map((t) => t.id);
}

/** 다음 환생 요구 조건 (UI용) — 최대면 null */
export function nextRebirthDef(p: PlayerState) {
  if (p.rebirth >= MAX_REBIRTH) return null;
  return REBIRTHS[p.rebirth];
}
