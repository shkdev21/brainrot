import { hashStr } from './rng';

// 절차적 표시명 생성 — 밈 특유의 "두 단어 감각"을 재현하는 오리지널 조합.
// 원작 명칭은 data/brainrots.ts의 source 필드로만 보존한다.

const WORD_A = [
  'Trippi', 'Bomba', 'Frutti', 'Pipi', 'Nostra', 'Buri', 'Cocco', 'Gira',
  'Trenno', 'Balleri', 'Chimp', 'Tunga', 'Frigi', 'Liro', 'Capri', 'Odin',
  'Trala', 'Svig', 'Rombi', 'Zucchi', 'Peppe', 'Mela', 'Topo', 'Nuvola',
  'Gatto', 'Fungo', 'Pino', 'Turbo', 'Bono', 'Sole',
];

const WORD_B = [
  'Troppi', 'Dino', 'Drillo', 'Kiwi', 'Pasta', 'Guffo', 'Panto', 'Fanti',
  'Turo', 'Nini', 'Meloni', 'Sahur', 'Camelo', 'Rollo', 'Loli', 'Puffi',
  'Netti', 'Bombi', 'Cusi', 'Rini', 'Fumo', 'Formi', 'Vaghi', 'Salto',
  'Rugi', 'Tonno', 'Perri', 'Grandi', 'Velo', 'Matti',
];

/** defId → 결정적 밈 스타일 이름 */
export function displayName(defId: string): string {
  const h = hashStr(defId);
  const a = WORD_A[h % WORD_A.length];
  const b = WORD_B[Math.floor(h / WORD_A.length) % WORD_B.length];
  return `${a} ${b}`;
}
