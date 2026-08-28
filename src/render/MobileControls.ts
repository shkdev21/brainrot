import type { PlayerController } from './PlayerController';

// 모바일 터치 컨트롤 — 가상 조이스틱(좌측), 카메라 드래그/핀치(우측), 액션 버튼.
// 기존 키 핸들러를 재사용하기 위해 버튼은 합성 KeyboardEvent를 발사한다.

export class MobileControls {
  private root: HTMLDivElement;
  private joyBase!: HTMLDivElement;
  private joyKnob!: HTMLDivElement;
  private joyTouchId: number | null = null;
  private joyAnchor: { x: number; y: number } = { x: 0, y: 0 };
  private camTouchId: number | null = null;
  private camLast: { x: number; y: number } = { x: 0, y: 0 };
  private pinchDist: number | null = null;
  readonly visible: boolean;

  constructor(
    private dom: HTMLElement,
    private pc: PlayerController,
  ) {
    this.visible =
      'ontouchstart' in window ||
      (window.matchMedia?.('(pointer: coarse)').matches ?? false);

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
    this.addButton('E', '줍기/훔치기', window.innerWidth - 96, window.innerHeight - 96, 68, '#2ecc71');
    this.addButton('Q', '휘두르기', window.innerWidth - 190, window.innerHeight - 130, 58, '#e17055');
    this.addButton('F', '잠금', window.innerWidth - 100, window.innerHeight - 200, 54, '#4da6ff');
    this.addButton('Space', '점프', window.innerWidth - 190, window.innerHeight - 58, 54, '#f1c40f');
    this.addButton('KeyB', '상점', window.innerWidth - 68, 120, 46, '#b44dff');
    this.addButton('KeyR', '환생', window.innerWidth - 68, 176, 46, '#e056fd');

    // 키보드 힌트 숨김 (버튼이 대체)
    const hints = document.getElementById('hints');
    if (hints) hints.style.display = 'none';

    this.root.style.display = this.visible ? 'block' : 'none';
    this.bindTouch();
    // 캔버스 제스처 기본 동작 차단
    this.dom.style.touchAction = 'none';
  }

  private addButton(
    code: string, label: string, x: number, y: number, size: number, color: string,
  ): void {
    const btn = document.createElement('div');
    btn.textContent = code === 'Space' ? '⬆' : code.replace('Key', '');
    btn.style.cssText =
      `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;` +
      `display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${size * 0.4}px;` +
      `color:#1a1a2e;background:${color};border:2px solid rgba(255,255,255,.4);` +
      `pointer-events:auto;box-shadow:0 4px 10px rgba(0,0,0,.35);` +
      `flex-direction:column;line-height:1;`;
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.cssText = 'font-size:9px;font-weight:700;opacity:.75;margin-top:1px;';
    btn.appendChild(cap);
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(0.9)';
      window.dispatchEvent(new KeyboardEvent('keydown', { code: code === 'Space' ? 'Space' : code }));
      window.setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: code === 'Space' ? 'Space' : code }));
        btn.style.transform = '';
      }, 120);
    }, { passive: false });
    this.root.appendChild(btn);
  }

  private bindTouch(): void {
    const isUiTarget = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && t.parentElement === this.root && t.style.pointerEvents === 'auto';

    this.dom.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (isUiTarget(t.target)) continue;
        e.preventDefault();
        // 화면 왼쪽 40% → 조이스틱, 나머지 → 카메라
        if (t.clientX < window.innerWidth * 0.4 && this.joyTouchId === null) {
          this.joyTouchId = t.identifier;
          this.joyAnchor = { x: t.clientX, y: t.clientY };
          this.joyBase.style.display = 'block';
          this.joyBase.style.left = `${t.clientX - 60}px`;
          this.joyBase.style.top = `${t.clientY - 60}px`;
          this.joyKnob.style.display = 'block';
          this.joyKnob.style.left = `${t.clientX - 26}px`;
          this.joyKnob.style.top = `${t.clientY - 26}px`;
        } else if (this.camTouchId === null) {
          this.camTouchId = t.identifier;
          this.camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    this.dom.addEventListener('touchmove', (e) => {
      const touches = Array.from(e.changedTouches);
      // 핀치 줌 — 두 손가락
      if (e.touches.length === 2) {
        const [a, b] = Array.from(e.touches);
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (this.pinchDist !== null) {
          this.pc.zoom((this.pinchDist - d) * 0.04);
        }
        this.pinchDist = d;
        return;
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
          this.pc.orbit((t.clientX - this.camLast.x) * 0.006, (t.clientY - this.camLast.y) * 0.004);
          this.camLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    const end = (e: TouchEvent) => {
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
    this.dom.addEventListener('touchend', end);
    this.dom.addEventListener('touchcancel', end);
  }

  /** 데스크톱 테스트용 강제 표시 */
  forceShow(): void {
    this.root.style.display = 'block';
  }
}
