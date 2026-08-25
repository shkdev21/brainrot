import type { Game } from '../core/GameState';
import { TOOLS } from '../data/tools';
import { purchaseTool } from '../core/ToolEffects';
import { formatMoney } from '../core/Economy';

// 도구 상점 모달 — B 키

export class Shop {
  private el: HTMLDivElement;
  private listEl: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, private game: Game, private onToast: (m: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'modal panel';
    this.el.id = 'shop';
    this.el.innerHTML = `
      <header><span>🛒 도구 상점</span><span class="close">✕</span></header>
      <div class="body"><div id="shop-list"></div></div>
    `;
    parent.appendChild(this.el);
    this.listEl = this.el.querySelector('#shop-list')!;
    this.el.querySelector('.close')!.addEventListener('click', () => this.toggle(false));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && !e.repeat) this.toggle(!this.open);
      if (e.code === 'Escape') this.toggle(false);
    });
  }

  toggle(open?: boolean): void {
    this.open = open ?? !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) this.render();
  }

  private render(): void {
    const p = this.game.player('p0')!;
    this.listEl.innerHTML = '';
    for (const t of TOOLS) {
      const locked = t.unlockRebirth > p.rebirth;
      const owned = p.purchasedTools.includes(t.id);
      const afford = p.money >= t.price;
      const row = document.createElement('div');
      row.className = `item-row${locked ? ' locked' : ''}`;
      row.innerHTML = `
        <div class="icon">${TOOL_ICON[t.id] ?? '🔧'}</div>
        <div class="info">
          <div class="name">${t.name} <small style="color:#f1c40f">${formatMoney(t.price)}</small></div>
          <div class="desc">${t.desc}</div>
          ${locked ? `<div class="req">🔒 환생 ${t.unlockRebirth} 필요</div>` : ''}
        </div>
        <button class="btn" ${locked || owned || !afford ? 'disabled' : ''}>
          ${owned ? '✓ 보유' : locked ? '잠김' : '구매'}
        </button>
      `;
      const btn = row.querySelector('button')!;
      btn.addEventListener('click', () => {
        const res = purchaseTool(this.game, 'p0', t.id);
        if (res.ok) {
          this.onToast(`🛍️ ${t.name} 구매! (단축키 ${p.purchasedTools.length}번)`);
          this.render();
        } else if (res.reason === 'not-enough-money') {
          this.onToast('💸 돈이 부족해요');
        }
      });
      this.listEl.appendChild(row);
    }
  }
}

const TOOL_ICON: Record<string, string> = {
  bat: '🏏', trap: '🪤', boots: '👟', cloak: '🥷', disco: '🕺',
  medusa: '🗿', web: '🕸️', turret: '🔫', sword: '⚔️', blink: '✨',
};
