import type { BrainrotDef } from '../core/types';

// 스탯은 나무위키 조사 데이터(docs/research/brainrots_normal.json) 차용.
// 상위 경매 4종은 웹 세션 밸런스를 위해 가격을 압축 조정(원작: $1B~$750B).

export const brainrots: BrainrotDef[] = [
  // ── 일반 / Common ─────────────────────────────
  { id: 'noobini',    rarity: 'common',    baseIncome: 1,    price: 25,      source: 'Noobini Pizzanini' },
  { id: 'lirili',     rarity: 'common',    baseIncome: 3,    price: 250,     source: 'Lirilì Larilà' },
  { id: 'timcheese',  rarity: 'common',    baseIncome: 5,    price: 500,     source: 'Tim Cheese' },
  { id: 'talpa',      rarity: 'common',    baseIncome: 9,    price: 1000,    source: 'Talpa Di Fero' },
  { id: 'svinina',    rarity: 'common',    baseIncome: 10,   price: 1200,    source: 'Svinina Bombardino' },
  { id: 'pipikiwi',   rarity: 'common',    baseIncome: 13,   price: 1500,    source: 'Pipi Kiwi' },
  // ── 희귀 / Rare ───────────────────────────────
  { id: 'trippi',     rarity: 'rare',      baseIncome: 15,   price: 2000,    source: 'Trippi Troppi' },
  { id: 'gangster',   rarity: 'rare',      baseIncome: 30,   price: 4000,    source: 'Gangster Footera' },
  { id: 'bandito',    rarity: 'rare',      baseIncome: 35,   price: 4500,    source: 'Bandito Bobritto' },
  { id: 'boneca',     rarity: 'rare',      baseIncome: 40,   price: 5000,    source: 'Boneca Ambalabu' },
  { id: 'cacto',      rarity: 'rare',      baseIncome: 50,   price: 6500,    source: 'Cacto Hipopotamo' },
  { id: 'tatata',     rarity: 'rare',      baseIncome: 55,   price: 7500,    source: 'Ta Ta Ta Ta Sahur' },
  { id: 'trictrac',   rarity: 'rare',      baseIncome: 65,   price: 9000,    source: 'Tric Trac Baraboom' },
  // ── 에픽 / Epic ───────────────────────────────
  { id: 'cappuccino', rarity: 'epic',      baseIncome: 75,   price: 10000,   source: 'Cappuccino Assassino' },
  { id: 'brrbrr',     rarity: 'epic',      baseIncome: 100,  price: 15000,   source: 'Brr Brr Patapim' },
  { id: 'antilopini', rarity: 'epic',      baseIncome: 115,  price: 17500,   source: 'Avocadini Antilopini' },
  { id: 'trulimero',  rarity: 'epic',      baseIncome: 125,  price: 20000,   source: 'Trulimero Trulicina' },
  { id: 'bambini',    rarity: 'epic',      baseIncome: 135,  price: 22500,   source: 'Bambini Crostini' },
  { id: 'bananita',   rarity: 'epic',      baseIncome: 150,  price: 25000,   source: 'Bananita Dolphinita' },
  { id: 'lemonchello',rarity: 'epic',      baseIncome: 160,  price: 27500,   source: 'Perochello Lemonchello' },
  { id: 'bombicus',   rarity: 'epic',      baseIncome: 175,  price: 30000,   source: 'Brri Brri Bicus Dicus Bombicus' },
  { id: 'guffo',      rarity: 'epic',      baseIncome: 225,  price: 35000,   source: 'Avocadini Guffo' },
  { id: 'penguino',   rarity: 'epic',      baseIncome: 250,  price: 40000,   source: 'Salamino Penguino' },
  { id: 'rollowambo', rarity: 'epic',      baseIncome: 275,  price: 42500,   source: 'Wambo Rollo' },
  // ── 전설 / Legendary (5분 확정 스폰) ───────────
  { id: 'burbaloni',  rarity: 'legendary', baseIncome: 200,  price: 35000,   source: 'Burbaloni Loliloli' },
  { id: 'chimpanzini',rarity: 'legendary', baseIncome: 300,  price: 50000,   source: 'Chimpanzini Bananini' },
  { id: 'ballerina',  rarity: 'legendary', baseIncome: 500,  price: 100000,  source: 'Ballerina Cappuccina' },
  { id: 'chefcrab',   rarity: 'legendary', baseIncome: 600,  price: 150000,  source: 'Chef Crabracadabra' },
  { id: 'glorbo',     rarity: 'legendary', baseIncome: 750,  price: 200000,  source: 'Glorbo Fruttodrillo' },
  { id: 'quivioli',   rarity: 'legendary', baseIncome: 900,  price: 225000,  source: 'Quivioli Ameleonni' },
  { id: 'octopusini', rarity: 'legendary', baseIncome: 1000, price: 250000,  source: 'Bluberrinni Octopusini' },
  { id: 'pipotato',   rarity: 'legendary', baseIncome: 1100, price: 265000,  source: 'Pipi Potato' },
  { id: 'pandaccini', rarity: 'legendary', baseIncome: 1250, price: 300000,  source: 'Pandaccini Bananini' },
  { id: 'sigmaboy',   rarity: 'legendary', baseIncome: 1350, price: 325000,  source: 'Sigma Boy' },
  // ── 신화 / Mythic (15분 확정 스폰) ─────────────
  { id: 'frigocamelo',rarity: 'mythic',    baseIncome: 2000, price: 350000,  source: 'Frigo Camelo' },
  { id: 'orangutini', rarity: 'mythic',    baseIncome: 2100, price: 400000,  source: 'Orangutini Ananassini' },
  { id: 'rhino',      rarity: 'mythic',    baseIncome: 2150, price: 450000,  source: 'Rhino Toasterino' },
  { id: 'bombardiro', rarity: 'mythic',    baseIncome: 2500, price: 500000,  source: 'Bombardiro Crocodilo' },
  { id: 'bombombini', rarity: 'mythic',    baseIncome: 5000, price: 1000000, source: 'Bombombini Gusini' },
  { id: 'cavallo',    rarity: 'mythic',    baseIncome: 7500, price: 2500000, source: 'Cavallo Virtuoso' },
  // ── 경매 전용 (갓/비밀급) ───────────────────────
  { id: 'grande',     rarity: 'god',       baseIncome: 10_000_000,   price: 8_000_000,    source: 'La Grande Combinasion', auctionOnly: true },
  { id: 'kelentang',  rarity: 'god',       baseIncome: 33_500_000,   price: 30_000_000,   source: 'Tang Tang Kelentang',  auctionOnly: true },
  { id: 'cerbero',    rarity: 'secret',    baseIncome: 75_000_000,   price: 120_000_000,  source: 'Dragon Cannelloni',    auctionOnly: true },
  { id: 'elefante',   rarity: 'secret',    baseIncome: 150_000_000,  price: 400_000_000,  source: 'Strawberry Elephant',  auctionOnly: true },
];

export const brainrotById: ReadonlyMap<string, BrainrotDef> = new Map(
  brainrots.map((b) => [b.id, b]),
);

export const RARITY_COLORS: Record<string, number> = {
  common: 0xb0b0b0,
  rare: 0x4da6ff,
  epic: 0xb44dff,
  legendary: 0xffb020,
  mythic: 0xff4d5e,
  god: 0x39ff88,
  secret: 0x1a1a2e,
};
