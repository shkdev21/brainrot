import type { Game } from '../core/GameState';
import { canRebirth, doRebirth } from '../core/Rebirth';
import { REBIRTHS } from '../data/rebirths';
import { brainrotById } from '../data/brainrots';
import { displayName } from '../core/names';
import { formatMoney } from '../core/Economy';

// 환생 패널 — R 키

export class RebirthPanel {
  private el: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private open = false;

  constructor(parent: HTMLElement, private game: Game, private onToast: (m: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'modal panel';
    this.el.innerHTML = `
      <header><span>♻️ 환생</span><span class="close">✕</span></header>
      <div class="body"></div>
    `;
    parent.appendChild(this.el);
    this.bodyEl = this.el.querySelector('.body')!;
    this.el.querySelector('.close')!.addEventListener('click', () => this.toggle(false));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && !e.repeat) this.toggle(!this.open);
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
    const check = canRebirth(this.game, 'p0');
    const def = REBIRTHS[p.rebirth];
    this.bodyEl.innerHTML = '';

    if (!def) {
      this.bodyEl.innerHTML = `<div style="text-align:center;font-weight:800;font-size:17px;color:#2ecc71">
        🏆 최대 환생 달성! 당신은 브레인롯 전설!</div>`;
      return;
    }

    // 진행 바 (돈 기준)
    const moneyRatio = Math.min(1, p.money / def.requiredMoney);
    const header = document.createElement('div');
    header.innerHTML = `
      <div style="font-weight:800;font-size:16px">환생 ${p.rebirth} → ${p.rebirth + 1}</div>
      <div class="rebirth-progress"><div style="width:${moneyRatio * 100}%"></div></div>
    `;
    this.bodyEl.appendChild(header);

    // 체크리스트
    const list = document.createElement('div');
    const rows: string[] = [];
    for (const id of def.requiredBrainrotIds) {
      const has = this.game.state.brainrots.some(
        (i) => i.ownerId === 'p0' && i.defId === id && i.location === 'base',
      );
      rows.push(`<div class="item-row">
        <div class="icon">🧠</div>
        <div class="info"><div class="name">${displayName(id)}</div>
        <div class="desc">등급 ${brainrotById.get(id)!.rarity}</div></div>
        <div class="${has ? 'check-ok' : 'check-no'}">${has ? '✓ 보유' : '✗ 미보유'}</div>
      </div>`);
    }
    const moneyOk = p.money >= def.requiredMoney;
    rows.push(`<div class="item-row">
      <div class="icon">💰</div>
      <div class="info"><div class="name">돈 ${formatMoney(def.requiredMoney)}</div>
      <div class="desc">현재 ${formatMoney(p.money)}</div></div>
      <div class="${moneyOk ? 'check-ok' : 'check-no'}">${moneyOk ? '✓' : '✗'}</div>
    </div>`);
    list.innerHTML = rows.join('');
    this.bodyEl.appendChild(list);

    const btn = document.createElement('button');
    btn.className = 'btn danger';
    btn.style.width = '100%';
    btn.style.marginTop = '6px';
    btn.textContent = check.ok
      ? `♻️ 환생하기! (브레인롯·돈 초기화, 슬롯 +4)`
      : '조건 미달성';
    btn.disabled = !check.ok;
    btn.addEventListener('click', () => {
      if (doRebirth(this.game, 'p0').ok) {
        this.onToast(`♻️ 환생 ${p.rebirth} 달성! 새 도구가 열렸다`);
        this.toggle(false);
      }
    });
    this.bodyEl.appendChild(btn);
  }
}
