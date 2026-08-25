// 타입드 이벤트 버스 — core → render/ui 단방향 통신

import type { Vec2 } from './types';

export interface GameEventMap {
  'spawned': { uid: string; defId: string; rarity: string; mutation: string | null };
  'despawned': { uid: string };
  'purchased': { uid: string; buyerId: string; price: number };
  'arrived': { uid: string; ownerId: string };
  'income-tick': { playerId: string; amount: number };
  'steal-started': { uid: string; thiefId: string; fromBaseId: number };
  'dropped': { uid: string; playerId: string };
  'ownership-transferred': { uid: string; newOwnerId: string };
  'stunned': { targetId: string; until: number; reason: string };
  'knockback': { targetId: string; dir: Vec2; force: number };
  'teleported': { playerId: string; from: Vec2; to: Vec2 };
  'dash': { playerId: string; dir: Vec2; distance: number };
  'locked': { baseId: number; ownerId: string; until: number };
  'unlocked': { baseId: number };
  'tool-used': { playerId: string; toolId: string };
  'tool-cooldown': { playerId: string; toolId: string; readyAt: number };
  'trap-placed': { trapId: string; ownerId: string; pos: Vec2 };
  'trap-triggered': { trapId: string; victimId: string };
  'turret-placed': { turretId: string; ownerId: string; pos: Vec2 };
  'turret-fired': { turretId: string; targetId: string };
  'turret-expired': { turretId: string };
  'rebirth-done': { playerId: string; level: number };
  'invisible': { playerId: string; until: number };
  'auction-started': { auctionId: string; defId: string; startPrice: number };
  'auction-bid': { auctionId: string; bidderId: string; amount: number };
  'auction-won': { auctionId: string; winnerId: string | null; amount: number };
  'error': { code: string; message: string };
}

export type GameEvent = keyof GameEventMap;

type Handler<T extends GameEvent> = (payload: GameEventMap[T]) => void;

export class EventBus {
  private handlers = new Map<GameEvent, Set<Handler<never>>>();

  on<T extends GameEvent>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<T extends GameEvent>(type: T, payload: GameEventMap[T]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<T>)(payload);
  }
}
