// WebAudio 신스 효과음 — 외부 에셋 없음.

type SfxName =
  | 'buy' | 'steal' | 'stunned' | 'rebirth' | 'auction'
  | 'lock' | 'error' | 'income';

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(0, ctx.currentTime + start);
    vol.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(vol).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.02);
  }

  private noise(start: number, dur: number, gain: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vol = ctx.createGain();
    vol.gain.value = gain;
    src.connect(vol).connect(ctx.destination);
    src.start(ctx.currentTime + start);
  }

  play(name: SfxName): void {
    switch (name) {
      case 'buy': // 상승 아르페지오
        this.tone(523, 0, 0.09, 'square', 0.06);
        this.tone(659, 0.07, 0.09, 'square', 0.06);
        this.tone(784, 0.14, 0.12, 'square', 0.06);
        break;
      case 'steal': // 팡파레
        this.tone(392, 0, 0.1, 'sawtooth', 0.05);
        this.tone(523, 0.09, 0.1, 'sawtooth', 0.05);
        this.tone(659, 0.18, 0.16, 'sawtooth', 0.05);
        this.tone(784, 0.26, 0.22, 'sawtooth', 0.05);
        break;
      case 'stunned':
        this.noise(0, 0.18, 0.08);
        this.tone(180, 0, 0.15, 'sawtooth', 0.05);
        break;
      case 'rebirth':
        for (let i = 0; i < 5; i++) {
          this.tone(523 * Math.pow(1.122, i), i * 0.09, 0.14, 'triangle', 0.06);
        }
        break;
      case 'auction': // 종
        this.tone(880, 0, 0.35, 'sine', 0.08);
        this.tone(1320, 0.02, 0.3, 'sine', 0.04);
        break;
      case 'lock':
        this.tone(300, 0, 0.06, 'square', 0.05);
        this.tone(200, 0.06, 0.08, 'square', 0.05);
        break;
      case 'error':
        this.tone(200, 0, 0.12, 'square', 0.05);
        break;
      case 'income':
        this.tone(1047, 0, 0.05, 'sine', 0.025);
        break;
    }
  }
}
