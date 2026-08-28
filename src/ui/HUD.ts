import type { Game } from '../core/GameState';
import type { PlayerState } from '../core/types';
import { formatMoney } from '../core/Economy';
import { TOOL_BY_ID } from '../data/tools';
import { displayName } from '../core/names';

// HUD — 좌상단 상태, 운반 배너, 하단 도구바, 조작 힌트

const TOOL_ICONS: Record<string, string> = {
  bat: '🏏', trap: '🪤', boots: '👟', cloak: '🥷', disco: '🕺',
  medusa: '🗿', web: '🕸️', turret: '🔫', sword: '⚔️', blink: '✨',
};

export class HUD {
  private moneyEl: HTMLDivElement;
  private incomeEl: HTMLSpanElement;
  private rebirthEl: HTMLSpanElement;
  private slotEl: HTMLSpanElement;
  private carryEl: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private toolSlots: HTMLDivElement[] = [];
  private carryLabel: HTMLSpanElement;
  private lockBanner: HTMLDivElement;
  private lockRemain: HTMLSpanElement;

  /** 슬롯 탭 → 도구 장착 토글 (모바일에서 1~0 키 대체) */
  onSlotTap: ((index: number) => void) | null = null;

  constructor(parent: HTMLElement) {
    parent.insertAdjacentHTML('beforeend', `
      <div id="hud" class="panel">
        <div class="money">$0</div>
        <div class="row">⚡ <span class="income">$0/s</span> · <span class="rebirth">환생 0</span></div>
        <div class="row">📦 <span id="hud-slots">0/10</span></div>
      </div>
      <div id="carry-banner" class="panel">🥷 운반 중 — <span id="carry-name"></span> · <span style="color:#74b9ff">[E] 내려놓기</span> / 기지로 돌아가!</div>
      <div id="lock-banner" class="panel" style="position:fixed;top:14px;right:14px;padding:8px 18px;font-weight:800;font-size:16px;color:#ff6b6b;display:none;border-color:rgba(255,107,107,.5)">🔒 기지 잠금 <span id="lock-remain"></span></div>
      <div id="toolbar" class="panel"></div>
      <div id="hints">
        <b>이동</b> WASD/방향키 · <b>점프</b> Space · <b>구매/훔치기</b> E<br>
        <b>기지 잠금</b> F (패드 위) · <b>상점</b> B · <b>환생</b> R<br>
        <b>도구 장착</b> 1~0 · <b>휘두르기</b> Q
      </div>
    `);
    this.moneyEl = parent.querySelector('#hud .money')!;
    this.incomeEl = parent.querySelector('#hud .income')!;
    this.rebirthEl = parent.querySelector('#hud .rebirth')!;
    this.slotEl = parent.querySelector('#hud-slots')!;
    this.carryEl = parent.querySelector('#carry-banner')!;
    this.carryLabel = parent.querySelector('#carry-name')!;
    this.lockBanner = parent.querySelector('#lock-banner')!;
    this.lockRemain = parent.querySelector('#lock-remain')!;
    this.toolbar = parent.querySelector('#toolbar')!;
  }

  update(g: Game, incomePerSec: number, owned: number, equippedToolId?: string): void {
    const p = g.player('p0');
    if (!p) return;
    this.moneyEl.textContent = formatMoney(p.money);
    this.incomeEl.textContent = `${formatMoney(incomePerSec)}/s`;
    this.rebirthEl.textContent = `환생 ${p.rebirth}`;
    this.slotEl.textContent = `${owned}/${p.slots}`;

    // 운반 배너
    if (p.carrying) {
      const inst = g.instance(p.carrying);
      this.carryEl.style.display = 'block';
      if (inst) this.carryLabel.textContent = displayName(inst.defId);
    } else {
      this.carryEl.style.display = 'none';
    }

    // 잠금 카운트다운
    const locked = g.state.timeMs < g.base(p.baseId)!.lockedUntil;
    if (locked) {
      const remain = Math.ceil((g.base(p.baseId)!.lockedUntil - g.state.timeMs) / 1000);
      this.lockBanner.style.display = 'block';
      this.lockRemain.textContent = `${remain}초`;
    } else {
      this.lockBanner.style.display = 'none';
    }

    this.updateToolbar(p, equippedToolId);
  }

  private updateToolbar(p: PlayerState, equippedToolId?: string): void {
    const tools = p.purchasedTools.slice(0, 10);
    // 슬롯 수 고정 (10)
    while (this.toolSlots.length < 10) {
      const el = document.createElement('div');
      el.className = 'tool-slot empty';
      this.toolbar.appendChild(el);
      this.toolSlots.push(el);
    }
    for (let i = 0; i < this.toolSlots.length; i++) {
      const el = this.toolSlots[i];
      const toolId = tools[i];
      if (!toolId) {
        el.className = 'tool-slot empty';
        el.innerHTML = '';
        continue;
      }
      el.className = 'tool-slot' + (toolId === equippedToolId ? ' equipped' : '');
      const icon = TOOL_ICONS[toolId] ?? '🔧';
      const cdOverlay = `<div class="cd" data-tool="${toolId}"></div>`;
      el.innerHTML = `<span class="hotkey">${(i + 1) % 10}</span>${icon}${cdOverlay}`;
      // 탭/클릭 → 장착 토글 (모바일 필수, 데스크톱도 클릭 가능)
      const idx = i;
      el.onpointerdown = (e) => {
        e.stopPropagation();
        this.onSlotTap?.(idx);
      };
    }
  }

  /** 쿨타임 오버레이 — GameViews가 매 프레임 호출 */
  updateCooldowns(p: PlayerState, gameNow: number): void {
    for (const el of this.toolSlots) {
      const overlay = el.querySelector<HTMLElement>('.cd');
      if (!overlay) continue;
      const toolId = overlay.dataset.tool!;
      const def = TOOL_BY_ID.get(toolId)!;
      const readyAt = p.toolCooldowns[toolId] ?? 0;
      const remain = Math.max(0, readyAt - gameNow);
      const ratio = def.cooldownMs > 0 ? remain / def.cooldownMs : 0;
      overlay.style.transform = `scaleY(${ratio})`;
    }
  }
}
