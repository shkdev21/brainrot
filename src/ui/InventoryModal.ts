import type { Game } from '../core/GameState';
import { brainrots, brainrotById, RARITY_COLORS } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { displayName } from '../core/names';
import { formatMoney, instanceIncome, playerIncomePerSec } from '../core/Economy';
import { TOOL_BY_ID } from '../data/tools';

export class InventoryModal {
  private el: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private tab = 'tools'; // 'tools' | 'owned' | 'all'
  private open = false;

  constructor(
    parent: HTMLElement,
    private game: Game,
    private onToast: (m: string) => void,
    private onEquipTool?: (toolId: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'modal panel';
    this.el.id = 'inventory-modal';
    this.el.innerHTML = `
      <header>
        <span>📦 아이템 / 브레인롯 목록</span>
        <span class="close">✕</span>
      </header>
      <div style="display:flex;gap:8px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.2)">
        <button class="btn tab-btn active" data-tab="tools">내 도구</button>
        <button class="btn tab-btn ghost" data-tab="owned">내 브레인롯</button>
        <button class="btn tab-btn ghost" data-tab="all">전체 도감</button>
      </div>
      <div class="body"><div id="inventory-content"></div></div>
    `;
    parent.appendChild(this.el);
    this.contentEl = this.el.querySelector('#inventory-content')!;

    this.el.querySelector('.close')!.addEventListener('click', () => this.toggle(false));

    this.el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        this.tab = target.dataset.tab ?? 'tools';
        this.el.querySelectorAll('.tab-btn').forEach((b) => {
          b.classList.remove('active');
          b.classList.add('ghost');
        });
        target.classList.add('active');
        target.classList.remove('ghost');
        this.render();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyI' && !e.repeat) this.toggle(!this.open);
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
  }

  toggle(open?: boolean): void {
    this.open = open ?? !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) this.render();
  }

  private render(): void {
    const p = this.game.player('p0')!;
    if (this.tab === 'tools') {
      this.renderTools(p);
    } else if (this.tab === 'owned') {
      this.renderOwned(p);
    } else {
      this.renderAll();
    }
  }

  private renderOwned(p: { id: string; slots: number }): void {
    const owned = this.game.state.brainrots.filter(
      (i) => i.ownerId === p.id && i.location === 'base',
    );
    const totalIncome = playerIncomePerSec(this.game.state, p.id);

    if (owned.length === 0) {
      this.contentEl.innerHTML = `
        <div style="text-align:center;padding:32px 16px;color:#94a3b8">
          <div style="font-size:36px;margin-bottom:8px">📦</div>
          <div style="font-weight:700;font-size:15px">보유 중인 브레인롯이 없습니다</div>
          <div style="font-size:12px;margin-top:4px">레드카펫에서 구매하거나 다른 기지에서 훔쳐보세요!</div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 2px 10px;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:10px">
        <span>보유 수: <b style="color:#74b9ff">${owned.length} / ${p.slots}</b></span>
        <span>총 수입: <b style="color:#2ecc71">+${formatMoney(totalIncome)}/s</b></span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:8px">
    `;

    for (const inst of owned) {
      const def = brainrotById.get(inst.defId)!;
      const mut = inst.mutation ? MUTATION_BY_ID.get(inst.mutation) : null;
      const income = instanceIncome(inst);
      const rarityHex = `#${RARITY_COLORS[def.rarity]?.toString(16).padStart(6, '0') ?? 'ffffff'}`;

      html += `
        <div class="panel" style="padding:8px 10px;background:rgba(255,255,255,0.04);border-color:${rarityHex};border-width:1px">
          <div style="font-weight:800;font-size:13px;color:${rarityHex}">${displayName(inst.defId)}</div>
          ${mut ? `<div style="font-size:11px;color:#ff9ff3;margin-top:1px">[${mut.id} ${mut.mult}x]</div>` : ''}
          <div style="font-size:11px;color:#2ecc71;font-weight:700;margin-top:4px">+${formatMoney(income)}/s</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${inst.slot ? `${inst.slot.floor}층 #${inst.slot.index + 1}` : '보관 중'}</div>
        </div>
      `;
    }
    html += `</div>`;
    this.contentEl.innerHTML = html;
  }

  private renderAll(): void {
    const ownedDefIds = new Set(
      this.game.state.brainrots
        .filter((i) => i.ownerId === 'p0')
        .map((i) => i.defId),
    );

    let html = `
      <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">전체 ${brainrots.length}종 중 ${ownedDefIds.size}종 발견</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:8px">
    `;

    for (const def of brainrots) {
      const discovered = ownedDefIds.has(def.id);
      const rarityHex = `#${RARITY_COLORS[def.rarity]?.toString(16).padStart(6, '0') ?? 'ffffff'}`;

      html += `
        <div class="panel" style="padding:8px 10px;background:rgba(255,255,255,0.03);opacity:${discovered ? '1' : '0.65'};border-color:${discovered ? rarityHex : 'rgba(255,255,255,0.1)'}">
          <div style="font-weight:800;font-size:13px;color:${rarityHex}">${displayName(def.id)}</div>
          <div style="font-size:11px;color:#f1c40f;margin-top:2px">${formatMoney(def.price)}</div>
          <div style="font-size:11px;color:#2ecc71;margin-top:1px">+${formatMoney(def.baseIncome)}/s</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">${def.rarity.toUpperCase()}</div>
        </div>
      `;
    }
    html += `</div>`;
    this.contentEl.innerHTML = html;
  }

  private renderTools(p: { purchasedTools: string[] }): void {
    if (p.purchasedTools.length === 0) {
      this.contentEl.innerHTML = `
        <div style="text-align:center;padding:32px 16px;color:#94a3b8">
          <div style="font-size:36px;margin-bottom:8px">🏏</div>
          <div style="font-weight:700;font-size:15px">보유 중인 도구가 없습니다</div>
          <div style="font-size:12px;margin-top:4px">상점(B)에서 방망이, 부츠, 은신망토 등을 구매해보세요!</div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:8px">
    `;

    p.purchasedTools.forEach((toolId, idx) => {
      const def = TOOL_BY_ID.get(toolId);
      if (!def) return;
      html += `
        <div class="panel" style="padding:8px 10px;background:rgba(255,255,255,0.04)">
          <div style="font-weight:800;font-size:13px;color:#ffd43b">${def.name} <small style="color:#64748b">[${idx + 1}]</small></div>
          <div style="font-size:11px;color:#94a3b8;margin-top:3px;line-height:1.3">${def.desc}</div>
          <button class="btn ghost equip-btn" data-tool="${def.id}" style="margin-top:8px;padding:3px 8px;font-size:11px;width:100%">장착 / 해제</button>
        </div>
      `;
    });
    html += `</div>`;
    this.contentEl.innerHTML = html;

    this.contentEl.querySelectorAll('.equip-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const toolId = (e.currentTarget as HTMLElement).dataset.tool;
        if (toolId && this.onEquipTool) {
          this.onEquipTool(toolId);
          this.onToast(`🔨 ${toolId} 장착 전환`);
        }
      });
    });
  }
}
