import type { Game } from './GameState';
import type { Rng } from './rng';
import { makeRng, pick } from './rng';
import { brainrots, brainrotById } from '../data/brainrots';
import { formatMoney } from './Economy';

// 경매 — 4분마다 god/secret급 1종, 30초 입찰. 시작가는 정가의 40%.
// 50% 확률로 이벤트 변이(candy/lava/galaxy) 부여. 봇은 스킬 상한까지 입찰.

export const AUCTION_DURATION_MS = 30000;
export const AUCTION_INTERVAL_MS = 240000;
export const BID_INCREMENT = 1.1; // 현재가의 +10%
const EVENT_MUTATIONS = ['candy', 'lava', 'galaxy'];

export interface BidResult {
  ok: boolean;
  reason?: string;
}

export class AuctionManager {
  private rng: Rng;
  private nextBotBidAt = 0;

  constructor(private game: Game, seed?: number) {
    this.rng = makeRng(seed ?? Date.now() % 2147483647);
  }

  /** GameViews의 고정 스텝에서 호출 */
  update(): void {
    const g = this.game;
    const now = g.state.timeMs;

    if (g.state.auction) {
      this.updateBotBids(now);
      if (now >= g.state.auction.endsAt) this.close();
      return;
    }

    if (now >= g.state.nextAuctionAt) {
      this.start();
    }
  }

  start(): void {
    const g = this.game;
    const pool = brainrots.filter((b) => b.auctionOnly);
    const def = pick(this.rng, pool);
    const mutation = this.rng() < 0.5 ? pick(this.rng, EVENT_MUTATIONS) : null;
    const startPrice = Math.floor(def.price * 0.4);
    g.state.seq += 1;
    g.state.auction = {
      id: `a${g.state.seq}`,
      defId: def.id,
      mutation,
      startPrice,
      currentBid: 0,
      highestBidder: null,
      endsAt: g.state.timeMs + AUCTION_DURATION_MS,
    };
    this.nextBotBidAt = g.state.timeMs + 3000;
    g.events.emit('auction-started', {
      auctionId: g.state.auction.id,
      defId: def.id,
      startPrice,
    });
  }

  /** 입찰 — 다음 최소 입찰액 = max(startPrice, currentBid×1.1) */
  minNextBid(): number {
    const a = this.game.state.auction;
    if (!a) return 0;
    return Math.max(a.startPrice, Math.ceil(a.currentBid * BID_INCREMENT));
  }

  bid(playerId: string, amount?: number): BidResult {
    const g = this.game;
    const a = g.state.auction;
    if (!a) return { ok: false, reason: 'no-auction' };
    if (g.state.timeMs >= a.endsAt) return { ok: false, reason: 'ended' };
    const p = g.player(playerId);
    if (!p) return { ok: false, reason: 'no-player' };
    const min = this.minNextBid();
    const bidAmount = amount ?? min;
    if (bidAmount < min) return { ok: false, reason: 'below-minimum' };
    if (p.money < bidAmount) return { ok: false, reason: 'not-enough-money' };
    // 같은 사람이 연속 입찰 방지는 하지 않음(원작도 상향 가능) — 최고가만 갱신
    a.currentBid = bidAmount;
    a.highestBidder = playerId;
    g.events.emit('auction-bid', { auctionId: a.id, bidderId: playerId, amount: bidAmount });
    return { ok: true };
  }

  private updateBotBids(now: number): void {
    const g = this.game;
    const a = g.state.auction!;
    if (now < this.nextBotBidAt) return;
    this.nextBotBidAt = now + 2500 + Math.floor(this.rng() * 2000);
    const def = brainrotById.get(a.defId)!;
    for (const bot of g.state.players) {
      if (!bot.isBot) continue;
      // 봇 상한: 정가의 (0.55 + skill×0.75)배 — 스킬 높은 봇이 더 과감
      const ceiling = def.price * (0.55 + bot.skill * 0.75);
      const min = this.minNextBid();
      if (min > ceiling) continue;
      if (bot.money < min) continue;
      if (this.rng() > 0.35 + bot.skill * 0.4) continue; // 입찰 성향
      if (a.highestBidder === bot.id) continue;
      a.currentBid = min;
      a.highestBidder = bot.id;
      g.events.emit('auction-bid', { auctionId: a.id, bidderId: bot.id, amount: min });
      return; // 틱당 한 명만
    }
  }

  /** 마감 — 최고가 낙찰(슬롯 직행) 또는 유찰 */
  close(): void {
    const g = this.game;
    const a = g.state.auction;
    if (!a) return;
    g.state.auction = null;
    g.state.nextAuctionAt = g.state.timeMs + AUCTION_INTERVAL_MS;

    let winnerId: string | null = a.highestBidder;
    const winner = winnerId ? g.player(winnerId) : undefined;
    if (!winner || winner.money < a.currentBid) {
      winnerId = null;
    }

    if (winnerId && winner) {
      winner.money -= a.currentBid;
      const owned = g.state.brainrots.filter(
        (i) => i.ownerId === winnerId && i.location === 'base',
      ).length;
      if (owned < winner.slots) {
        g.state.seq += 1;
        g.state.brainrots.push({
          uid: `r${g.state.seq}`,
          defId: a.defId,
          mutation: a.mutation,
          ownerId: winnerId,
          location: 'base',
          slot: g.reserveSlot(winner),
          walkingUntil: g.state.timeMs + 1500,
          expiresAt: 0,
          earning: false,
        });
      }
    }
    g.events.emit('auction-won', {
      auctionId: a.id,
      winnerId,
      amount: a.currentBid,
    });
  }
}

export function auctionBidLabel(amount: number): string {
  return formatMoney(amount);
}
