import type {
  GameState, PlayerState, BaseState, BrainrotInstance, Persona,
} from './types';
import { brainrots, brainrotById } from '../data/brainrots';
import { NATURAL_MUTATION_WEIGHTS } from '../data/mutations';
import { BASE_SLOTS } from '../data/rebirths';
import { makeRng, weightedPick, pick, type Rng } from './rng';
import { EventBus } from './events';
import {
  CARPET_CAP, CARPET_TTL_MS, WALK_MS, nextSpawnDelayMs,
  playerIncomePerSec, ownedCount,
} from './Economy';
import { updateCarry, updateDropped } from './Carry';
import { updateLocks } from './BaseLock';
import { updateDeployables } from './ToolEffects';

// Game — 월드 시뮬레이션 허브. 20Hz 고정 스텝 tick.

export interface GameOptions {
  seed?: number;
  botPersonas?: Persona[];
  playerNames?: string[];
  /** 테스트용: 초기 자금 */
  startingMoney?: number;
}

const BOT_NAMES = ['레오', '미라', '타로', '주니', '케이', '리노', '사사'];

export class Game {
  readonly state: GameState;
  readonly events = new EventBus();
  readonly rng: Rng;
  private incomeAccum = 0;

  constructor(opts: GameOptions = {}) {
    this.rng = makeRng(opts.seed ?? Date.now() % 2147483647);
    const startingMoney = opts.startingMoney ?? 500;

    const personas: Persona[] = opts.botPersonas ?? [
      'raider', 'raider', 'raider', 'guardian', 'guardian', 'farmer', 'farmer',
    ];
    const names = opts.playerNames ?? ['나', ...BOT_NAMES];

    const players: PlayerState[] = [];
    const bases: BaseState[] = [];
    for (let i = 0; i < 8; i++) {
      const isBot = i > 0;
      const id = i === 0 ? 'p0' : `b${i}`;
      players.push({
        id,
        name: names[i] ?? id,
        isBot,
        persona: isBot ? personas[(i - 1) % personas.length] : null,
        skill: isBot ? 0.3 + this.rng() * 0.6 : 1,
        money: i === 0 ? startingMoney : startingMoney + Math.floor(this.rng() * 200),
        rebirth: 0,
        slots: BASE_SLOTS,
        baseId: i,
        carrying: null,
        stunUntil: 0,
        slowUntil: 0,
        invisUntil: 0,
        unlockedTools: [],
        purchasedTools: [],
        toolCooldowns: {},
        botBidCeiling: 0,
      });
      bases.push({
        id: i,
        ownerId: id,
        lockedUntil: 0,
        lockCooldownUntil: 0,
        notifiedUnlock: true,
        unlockedFloors: 1,
      });
    }

    this.state = {
      timeMs: 0,
      seed: opts.seed ?? 0,
      players,
      bases,
      brainrots: [],
      traps: [],
      turrets: [],
      nextSpawnAt: {},
      nextAuctionAt: 240000,
      auction: null,
      seq: 0,
      positions: {},
    };

    // 첫 스폰 타이머: 커먼은 즉시 하나 (튜토리얼용 최저가 고정)
    for (const rarity of SPAWN_TIMING_RARITIES) {
      this.state.nextSpawnAt[rarity] = nextSpawnDelayMs(this.rng, rarity);
    }
    this.state.nextSpawnAt['common'] = 500;
    this.firstSpawnTutorial = true;
  }

  player(id: string): PlayerState | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  base(baseId: number): BaseState | undefined {
    return this.state.bases.find((b) => b.id === baseId);
  }

  instance(uid: string): BrainrotInstance | undefined {
    return this.state.brainrots.find((i) => i.uid === uid);
  }

  private uid(prefix: string): string {
    this.state.seq += 1;
    return `${prefix}${this.state.seq}`;
  }

  // ── 메인 틱 ────────────────────────────────────────────────

  tick(dtMs: number): void {
    const prev = this.state.timeMs;
    this.state.timeMs += dtMs;
    const now = this.state.timeMs;

    this.updateSpawns(now);
    this.updateIncome(now, prev);
    this.updateArrivals(now);
    this.updateExpiry(now);
    updateCarry(this, dtMs);
    updateDropped(this);
    updateLocks(this);
    updateDeployables(this);
  }

  private updateSpawns(now: number): void {
    const carpetCount = this.state.brainrots.filter((i) => i.location === 'carpet').length;
    for (const rarity of SPAWN_TIMING_RARITIES) {
      if ((this.state.nextSpawnAt[rarity] ?? Infinity) > now) continue;
      if (carpetCount >= CARPET_CAP) {
        // 카펫이 가득하면 5초 뒤 재시도
        this.state.nextSpawnAt[rarity] = now + 5000;
        continue;
      }
      this.spawnOnCarpet(rarity);
      this.state.nextSpawnAt[rarity] = now + nextSpawnDelayMs(this.rng, rarity);
    }
  }

  private firstSpawnTutorial = false;

  spawnOnCarpet(rarity: string): BrainrotInstance | null {
    let pool = brainrots.filter((b) => b.rarity === rarity && !b.auctionOnly);
    if (pool.length === 0) return null;
    let def;
    if (this.firstSpawnTutorial && rarity === 'common') {
      def = brainrotById.get('noobini') ?? pool[0];
      this.firstSpawnTutorial = false;
    } else {
      def = pick(this.rng, pool);
    }
    const mutRoll = weightedPick(this.rng, NATURAL_MUTATION_WEIGHTS);
    const inst: BrainrotInstance = {
      uid: this.uid('r'),
      defId: def.id,
      mutation: mutRoll === 'none' ? null : mutRoll,
      ownerId: null,
      location: 'carpet',
      slot: null,
      walkingUntil: 0,
      expiresAt: this.state.timeMs + CARPET_TTL_MS,
      earning: false,
    };
    this.state.brainrots.push(inst);
    this.events.emit('spawned', {
      uid: inst.uid, defId: def.id, rarity, mutation: inst.mutation,
    });
    return inst;
  }

  private updateIncome(now: number, prev: number): void {
    // 1초 배치 적립 — dt가 길면 여러 배치 처리
    this.incomeAccum += now - prev;
    while (this.incomeAccum >= 1000) {
      this.incomeAccum -= 1000;
      for (const p of this.state.players) {
        const amt = playerIncomePerSec(this.state, p.id);
        if (amt <= 0) continue;
        p.money += amt;
        this.events.emit('income-tick', { playerId: p.id, amount: amt });
      }
    }
  }

  private updateArrivals(now: number): void {
    for (const inst of this.state.brainrots) {
      if (
        inst.location === 'base' && !inst.earning &&
        inst.walkingUntil > 0 && now >= inst.walkingUntil
      ) {
        inst.earning = true;
        inst.walkingUntil = 0;
        this.events.emit('arrived', { uid: inst.uid, ownerId: inst.ownerId ?? '' });
      }
    }
  }

  private updateExpiry(now: number): void {
    const expired = this.state.brainrots.filter(
      (i) => i.location === 'carpet' && now >= i.expiresAt,
    );
    for (const inst of expired) {
      this.removeInstance(inst.uid);
      this.events.emit('despawned', { uid: inst.uid });
    }
  }

  removeInstance(uid: string): void {
    const idx = this.state.brainrots.findIndex((i) => i.uid === uid);
    if (idx >= 0) this.state.brainrots.splice(idx, 1);
  }

  // ── 구매 ───────────────────────────────────────────────────

  buy(playerId: string, uid: string): { ok: boolean; reason?: string } {
    const p = this.player(playerId);
    const inst = this.instance(uid);
    if (!p) return { ok: false, reason: 'no-player' };
    if (!inst) return { ok: false, reason: 'no-instance' };
    if (inst.location !== 'carpet') return { ok: false, reason: 'not-on-carpet' };
    const def = brainrotById.get(inst.defId);
    if (!def) return { ok: false, reason: 'no-def' };
    if (p.money < def.price) return { ok: false, reason: 'not-enough-money' };
    if (ownedCount(this.state, playerId) >= p.slots) {
      return { ok: false, reason: 'base-full' };
    }

    p.money -= def.price;
    inst.ownerId = playerId;
    inst.location = 'base';
    inst.expiresAt = 0;
    inst.slot = this.reserveSlot(p);
    inst.walkingUntil = this.state.timeMs + WALK_MS;
    inst.earning = false;
    this.events.emit('purchased', { uid, buyerId: playerId, price: def.price });
    return { ok: true };
  }

  /** 기지 슬롯 배정 — 층당 10슬롯(좌우 패드×앞뒤), 1층부터 순서대로 */
  reserveSlot(p: PlayerState): { baseId: number; floor: 1 | 2 | 3; index: number } {
    const used = new Set(
      this.state.brainrots
        .filter((i) => i.ownerId === p.id && i.slot && i.location === 'base')
        .map((i) => `${i.slot!.floor}:${i.slot!.index}`),
    );
    const floors: (1 | 2 | 3)[] = [1, 2, 3].slice(0, this.base(p.baseId)?.unlockedFloors ?? 1) as (1 | 2 | 3)[];
    const perFloor = Math.min(p.slots, 10); // 층당 슬롯 상한
    for (const f of floors) {
      for (let idx = 0; idx < perFloor; idx++) {
        if (!used.has(`${f}:${idx}`)) {
          return { baseId: p.baseId, floor: f, index: idx };
        }
      }
    }
    // 슬롯 해방이 필요한 비상 상황 — 1층 0번 강제 (호출부에서 base-full 방어됨)
    return { baseId: p.baseId, floor: 1, index: 0 };
  }
}

const SPAWN_TIMING_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
