import type { Game } from '../core/GameState';
import type { AuctionManager } from '../core/Auction';
import { brainrotById } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { displayName } from '../core/names';
import { formatMoney } from '../core/Economy';
import { RARITY_COLORS } from '../data/brainrots';

// 경매 패널 — 경매 진행 중 하단 중앙에 표시

export class AuctionPanel {
  private el: HTMLDivElement;
  private timer: number | null = null;

  constructor(parent: HTMLElement, private game: Game, private auction: AuctionManager, private onToast: (m: string) => void) {
    this.el = document.createElement('div');
    this.el.id = 'auction-panel';
    this.el.className = 'panel';
    this.el.style.cssText =
      'position:fixed;bottom:92px;left:50%;transform:translateX(-50%);padding:12px 18px;display:none;min-width:380px;';
    parent.appendChild(this.el);
    this.timer = window.setInterval(() => this.render(), 500);
    this.render();
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.el.remove();
  }

  private render(): void {
    const a = this.game.state.auction;
    if (!a) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'block';
    const def = brainrotById.get(a.defId)!;
    const mut = a.mutation ? MUTATION_BY_ID.get(a.mutation) : null;
    const remain = Math.max(0, a.endsAt - this.game.state.timeMs) / 1000;
    const min = this.auction.minNextBid();
    const p = this.game.player('p0')!;
    const highest = a.highestBidder
      ? (this.game.player(a.highestBidder)?.name ?? '?')
      : '없음';
    const rarityHex = `#${RARITY_COLORS[def.rarity]?.toString(16).padStart(6, '0') ?? 'ffffff'}`;
    this.el.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:34px">🔨</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:16px">
            <span style="color:${rarityHex}">${displayName(a.defId)}</span>
            ${mut ? `<span style="color:#ff9ff3">[${mut.id} ${mut.mult}x]</span>` : ''}
            <span style="float:right;color:#ffd43b">⏱ ${remain.toFixed(0)}s</span>
          </div>
          <div style="font-size:13px;opacity:.85;margin-top:3px">
            현재 입찰 <b style="color:#2ecc71">${a.currentBid > 0 ? formatMoney(a.currentBid) : formatMoney(a.startPrice)}</b>
            · 최고 입찰자 <b>${highest}</b>
          </div>
        </div>
        <button class="btn ghost">입찰 ${formatMoney(min)}</button>
      </div>
    `;
    const btn = this.el.querySelector('button')!;
    btn.disabled = p.money < min;
    btn.addEventListener('click', () => {
      const res = this.auction.bid('p0');
      if (res.ok) {
        this.onToast(`🔨 입찰 성공! ${formatMoney(min)}`);
        this.render();
      } else if (res.reason === 'not-enough-money') {
        this.onToast('💸 입찰 금액이 부족해요');
      }
    });
  }
}
