// 토스트 알림 — 우상단 스택

export class Toasts {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'toasts';
    parent.appendChild(this.root);
  }

  show(msg: string, kind: '' | 'warn' | 'good' = ''): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}
