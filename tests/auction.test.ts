import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/GameState';
import { AuctionManager, AUCTION_DURATION_MS, AUCTION_INTERVAL_MS } from '../src/core/Auction';
import { brainrotById } from '../src/data/brainrots';

function setup(seed = 91, money = 1e9) {
  const g = new Game({ seed, startingMoney: money });
  const mgr = new AuctionManager(g, seed * 3 + 1);
  return { g, mgr };
}

describe('auction', () => {
  it('시작가는 정가의 40%, 50% 확률로 이벤트 변이', () => {
    const { g, mgr } = setup(92);
    g.state.nextAuctionAt = 0;
    mgr.start();
    const a = g.state.auction!;
    const def = brainrotById.get(a.defId)!;
    expect(def.auctionOnly).toBe(true);
    expect(a.startPrice).toBe(Math.floor(def.price * 0.4));
    expect(a.endsAt).toBeGreaterThan(g.state.timeMs);
    expect(['candy', 'lava', 'galaxy', null]).toContain(a.mutation);
  });

  it('최소 입찰 미만 거부 / 잔액 부족 거부', () => {
    const { g, mgr } = setup(93);
    g.player('p0')!.money = 100;
    g.state.nextAuctionAt = 0;
    mgr.start();
    const res1 = mgr.bid('p0', 1);
    expect(res1.ok).toBe(false);
    expect(res1.reason).toBe('below-minimum');
    const res2 = mgr.bid('p0');
    expect(res2.ok).toBe(false);
    expect(res2.reason).toBe('not-enough-money');
  });

  it('정상 입찰 — 최고가 갱신', () => {
    const { g, mgr } = setup(94);
    g.state.nextAuctionAt = 0;
    mgr.start();
    const a = g.state.auction!;
    const res = mgr.bid('p0', a.startPrice);
    expect(res.ok).toBe(true);
    expect(a.highestBidder).toBe('p0');
    expect(a.currentBid).toBe(a.startPrice);
  });

  it('마감 — 최고 입찰자가 결제하고 브레인롯 수령', () => {
    const { g, mgr } = setup(95);
    g.state.nextAuctionAt = 0;
    mgr.start();
    const a = g.state.auction!;
    const before = g.player('p0')!.money;
    mgr.bid('p0', a.startPrice);
    g.state.auction!.endsAt = g.state.timeMs - 1; // 마감 강제
    mgr.close();
    expect(g.state.auction).toBeNull();
    expect(g.player('p0')!.money).toBe(before - a.startPrice);
    const won = g.state.brainrots.find((i) => i.defId === a.defId);
    expect(won).toBeDefined();
    expect(won!.ownerId).toBe('p0');
    expect(won!.mutation).toBe(a.mutation);
    // 다음 경매 예약
    expect(g.state.nextAuctionAt).toBe(g.state.timeMs + AUCTION_INTERVAL_MS);
  });

  it('입찰 없는 경매는 유찰', () => {
    const { g, mgr } = setup(96);
    g.state.nextAuctionAt = 0;
    mgr.start();
    g.state.auction!.endsAt = g.state.timeMs - 1;
    let wonEvent: string | null | undefined;
    g.events.on('auction-won', ({ winnerId }) => { wonEvent = winnerId; });
    mgr.close();
    expect(wonEvent).toBeNull();
    expect(g.state.brainrots.filter((i) => i.ownerId === 'p0').length).toBe(0);
  });

  it('봇은 상한을 넘어 입찰하지 않는다', () => {
    const { g, mgr } = setup(97);
    g.state.nextAuctionAt = 0;
    mgr.start();
    const a = g.state.auction!;
    const def = brainrotById.get(a.defId)!;
    // 모든 봇 상한 위로 현재가 설정
    const maxCeiling = def.price * (0.55 + 1 * 0.75);
    a.currentBid = Math.ceil(maxCeiling * 1.1);
    a.highestBidder = null;
    const before = a.currentBid;
    // 봇 입찰 시도 — 여러 번
    for (let i = 0; i < 30; i++) mgr.update();
    expect(a.currentBid).toBe(before);
    expect(a.highestBidder).toBeNull();
  });

  it('update()가 주기적으로 경매를 개최한다', () => {
    const { g, mgr } = setup(98);
    g.state.nextAuctionAt = 1000;
    mgr.update();
    expect(g.state.auction).toBeNull(); // 아직 전
    g.tick(2000); // nextAuctionAt 도달
    mgr.update();
    expect(g.state.auction).not.toBeNull();
    expect(g.state.auction!.endsAt).toBeLessThanOrEqual(g.state.timeMs + AUCTION_DURATION_MS);
  });

  it('플레이어가 최고가면 봇이 이겨도 플레이어 낙찰 유지', () => {
    const { g, mgr } = setup(99);
    g.state.nextAuctionAt = 0;
    mgr.start();
    const a = g.state.auction!;
    mgr.bid('p0', a.startPrice * 2);
    g.state.auction!.endsAt = g.state.timeMs - 1;
    mgr.close();
    const won = g.state.brainrots.find((i) => i.defId === a.defId);
    expect(won!.ownerId).toBe('p0');
  });
});
