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
  private dismissedAuctionId: string | null = null;

  constructor(parent: HTMLElement, private game: Game, private auction: AuctionManager, private onToast: (m: string) => void) {
    this.el = document.createElement('div');
    this.el.id = 'auction-panel';
    this.el.className = 'panel';
    this.el.style.cssText =
      'position:fixed;bottom:92px;left:50%;transform:translateX(-50%);padding:12px 18px;display:none;min-width:380px;';
    parent.appendChild(this.el);

    this.timer = window.setInterval(() => this.render(), 500);
    this.game.events.on('auction-started', () => {
      this.dismissedAuctionId = null;
      this.render();
    });
    this.game.events.on('auction-won', () => {
      this.el.style.display = 'none';
    });
    this.render();
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.el.remove();
  }

  private render(): void {
    const a = this.game.state.auction;
    if (!a || a.id === this.dismissedAuctionId || this.game.state.timeMs >= a.endsAt) {
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
      <div style="position:relative;display:flex;align-items:center;gap:12px">
        <div style="font-size:32px">🔨</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:15px">
            <span style="color:${rarityHex}">${displayName(a.defId)}</span>
            ${mut ? `<span style="color:#ff9ff3">[${mut.id} ${mut.mult}x]</span>` : ''}
            <span style="float:right;color:#ffd43b;margin-right:20px">⏱ ${remain.toFixed(0)}s</span>
          </div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">
            현재 <b style="color:#2ecc71">${a.currentBid > 0 ? formatMoney(a.currentBid) : formatMoney(a.startPrice)}</b>
            · 최고 <b>${highest}</b>
          </div>
        </div>
        <button class="btn ghost bid-btn">입찰 ${formatMoney(min)}</button>
        <div class="auction-close" style="cursor:pointer;font-size:18px;opacity:.65;padding:4px 6px;line-height:1">✕</div>
      </div>
    `;

    const closeBtn = this.el.querySelector('.auction-close') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismissedAuctionId = a.id;
        this.el.style.display = 'none';
      });
      closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    const btn = this.el.querySelector('.bid-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = p.money < min;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
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
}
