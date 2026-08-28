import type { GameViews } from './GameViews';
import type { PlayerController } from './PlayerController';

// 모바일 터치 컨트롤 — 가상 조이스틱(좌측), 카메라 드래그/핀치(우측), 액션 버튼.

export class MobileControls {
  private root: HTMLDivElement;
  private joyBase!: HTMLDivElement;
  private joyKnob!: HTMLDivElement;
  private joyTouchId: number | null = null;
  private joyAnchor: { x: number; y: number } = { x: 0, y: 0 };
  private camTouchId: number | null = null;
  private camLast: { x: number; y: number } = { x: 0, y: 0 };
  private pinchDist: number | null = null;
  private pc: PlayerController;
  readonly visible: boolean;

  constructor(
    private dom: HTMLElement,
    private views: GameViews,
  ) {
    this.pc = views.player;
    this.visible =
      'ontouchstart' in window ||
      (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
      window.innerWidth <= 840;

    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:8;font-family:sans-serif;user-select:none;-webkit-user-select:none;';
    document.getElementById('ui')!.appendChild(this.root);

    // ── 가상 조이스틱 (좌측 하단, 터치 지점에 떠오르는 플로팅) ──
    this.joyBase = document.createElement('div');
    this.joyBase.style.cssText =
      'position:fixed;width:120px;height:120px;border-radius:50%;display:none;' +
      'background:rgba(255,255,255,0.10);border:2px solid rgba(255,255,255,0.35);pointer-events:none;';
    this.joyKnob = document.createElement('div');
    this.joyKnob.style.cssText =
      'position:fixed;width:52px;height:52px;border-radius:50%;display:none;' +
      'background:rgba(255,255,255,0.55);pointer-events:none;';
    this.root.appendChild(this.joyBase);
    this.root.appendChild(this.joyKnob);

    // ── 액션 버튼 (우측 클러스터) ──
    this.addButton('KeyE', '줍기/훔치기', 24, 28, 68, '#2ecc71', 'bottom');
    this.addButton('KeyQ', '휘두르기', 112, 44, 58, '#e17055', 'bottom');
    this.addButton('KeyF', '잠금', 30, 122, 54, '#4da6ff', 'bottom');
    this.addButton('Space', '점프', 116, 122, 54, '#f1c40f', 'bottom');
    this.addButton('KeyI', '아이템', 16, undefined, 46, '#00cec9', 'top', 64);
    this.addButton('KeyB', '상점', 16, undefined, 46, '#b44dff', 'top', 118);
    this.addButton('KeyR', '환생', 16, undefined, 46, '#e056fd', 'top', 172);

    // 키보드 힌트 표시 제어 (모바일일 때만 숨김)
    const hints = document.getElementById('hints');
    if (this.visible) {
      document.body.classList.add('mobile');
      if (hints) hints.style.display = 'none';
    } else {
      document.body.classList.remove('mobile');
      if (hints) hints.style.display = 'block';
    }

    this.root.style.display = this.visible ? 'block' : 'none';
    this.bindTouch();
    // 캔버스 제스처 기본 동작 차단
    this.dom.style.touchAction = 'none';

    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth <= 840 || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      const h = document.getElementById('hints');
      if (isMobile) {
        document.body.classList.add('mobile');
        this.root.style.display = 'block';
        if (h) h.style.display = 'none';
      } else {
        document.body.classList.remove('mobile');
        this.root.style.display = 'none';
        if (h) h.style.display = 'block';
      }
    });
  }

  private executeAction(code: string, pressed: boolean): void {
    if (pressed) {
      switch (code) {
        case 'KeyE':
          this.views.triggerInteract();
          break;
        case 'KeyQ':
          this.views.triggerSwing();
          break;
        case 'KeyF':
          this.views.triggerLock();
          break;
        case 'Space':
          this.pc.setJump(true);
          break;
        case 'KeyI':
          this.views.toggleInventory();
          break;
        case 'KeyB':
          this.views.toggleShop();
          break;
        case 'KeyR':
          this.views.toggleRebirth();
          break;
      }
    } else {
      if (code === 'Space') {
        this.pc.setJump(false);
      }
    }
  }

  private addButton(
    code: string, label: string, right: number, bottom: number | undefined,
    size: number, color: string, anchor: 'bottom' | 'top' = 'bottom', top?: number,
  ): void {
    const btn = document.createElement('div');
    btn.textContent = code === 'Space' ? '⬆' : code.replace('Key', '');
    const pos = anchor === 'bottom'
      ? `right:calc(${right}px + env(safe-area-inset-right, 0px));bottom:calc(${bottom}px + env(safe-area-inset-bottom, 0px));`
      : `right:calc(${right}px + env(safe-area-inset-right, 0px));top:calc(${top}px + env(safe-area-inset-top, 0px));`;
    btn.style.cssText =
      `position:fixed;${pos}width:${size}px;height:${size}px;border-radius:50%;` +
      `display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${size * 0.4}px;` +
      `color:#1a1a2e;background:${color};border:2px solid rgba(255,255,255,.4);` +
      `pointer-events:auto;box-shadow:0 4px 10px rgba(0,0,0,.35);` +
      `flex-direction:column;line-height:1;user-select:none;-webkit-user-select:none;`;
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.cssText = 'font-size:9px;font-weight:700;opacity:.75;margin-top:1px;pointer-events:none;';
    btn.appendChild(cap);
    btn.style.touchAction = 'none';

    const press = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(0.88)';
      this.executeAction(code, true);
    };

    const release = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      btn.style.transform = '';
      this.executeAction(code, false);
    };

    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);

    this.root.appendChild(btn);
  }

  private bindTouch(): void {
    const isModalOpen = (): boolean => document.querySelector('.modal.open') !== null;

    const isInteractiveUi = (t: EventTarget | null): boolean => {
      if (!t || !(t instanceof HTMLElement)) return false;
      return t.closest('.modal') !== null ||
             t.closest('#toolbar') !== null ||
             t.closest('#hud-slots-row') !== null ||
             t.closest('#auction-panel') !== null;
    };

    window.addEventListener('touchstart', (e) => {
      if (isModalOpen()) return;

      const halfW = window.innerWidth * 0.5;
      for (const t of Array.from(e.changedTouches)) {
        if (isInteractiveUi(t.target)) continue;

        // 화면 좌측(또는 조이스틱 미할당 시 좌측) → 조이스틱
        if (t.clientX < halfW && this.joyTouchId === null) {
          this.joyTouchId = t.identifier;
          this.joyAnchor = { x: t.clientX, y: t.clientY };
          this.joyBase.style.display = 'block';
          this.joyBase.style.left = `${t.clientX - 60}px`;
          this.joyBase.style.top = `${t.clientY - 60}px`;
          this.joyKnob.style.display = 'block';
          this.joyKnob.style.left = `${t.clientX - 26}px`;
          this.joyKnob.style.top = `${t.clientY - 26}px`;
          this.pc.setAnalog(0, 0);
        } else if (this.camTouchId === null) {
          // 화면 우측(또는 조이스틱 이외의 터치) → 카메라 회전
          this.camTouchId = t.identifier;
          this.camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (isModalOpen()) return;

      const touches = Array.from(e.touches);
      // 핀치 줌 — 두 손가락 (우측 영역)
      if (touches.length >= 2 && this.camTouchId !== null) {
        const rightTouches = touches.filter((t) => t.clientX >= window.innerWidth * 0.4);
        if (rightTouches.length >= 2) {
          const [a, b] = rightTouches;
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (this.pinchDist !== null) {
            this.pc.zoom((this.pinchDist - d) * 0.04);
          }
          this.pinchDist = d;
          return;
        }
      }
      this.pinchDist = null;

      for (const t of touches) {
        if (t.identifier === this.joyTouchId) {
          const dx = t.clientX - this.joyAnchor.x;
          const dy = t.clientY - this.joyAnchor.y;
          const len = Math.hypot(dx, dy);
          const max = 55;
          const cl = Math.min(len, max);
          const nx = len > 0 ? (dx / len) * (cl / max) : 0;
          const ny = len > 0 ? (dy / len) * (cl / max) : 0;
          // 화면 위쪽 = 전방 (+z 성분)
          this.pc.setAnalog(nx, -ny);
          this.joyKnob.style.left = `${this.joyAnchor.x + (len > 0 ? (dx / len) * cl : 0) - 26}px`;
          this.joyKnob.style.top = `${this.joyAnchor.y + (len > 0 ? (dy / len) * cl : 0) - 26}px`;
        } else if (t.identifier === this.camTouchId) {
          const dx = t.clientX - this.camLast.x;
          const dy = t.clientY - this.camLast.y;
          this.pc.orbit(dx * 0.008, dy * 0.005);
          this.camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    const handleEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyTouchId) {
          this.joyTouchId = null;
          this.pc.setAnalog(0, 0);
          this.joyBase.style.display = 'none';
          this.joyKnob.style.display = 'none';
        }
        if (t.identifier === this.camTouchId) {
          this.camTouchId = null;
        }
      }
      if (e.touches.length < 2) this.pinchDist = null;
    };

    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
  }

  /** 데스크톱 테스트용 강제 표시 */
  forceShow(): void {
    this.root.style.display = 'block';
  }
}
