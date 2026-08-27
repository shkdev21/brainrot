import type { Game } from './GameState';
import type { PlayerState, BaseState, BrainrotInstance } from './types';

// 저장/불러오기 — localStorage 스냅샷. 10초 자동 + 종료 시 저장.

const KEY = 'steal-a-brainrot-save';
const VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  timeMs: number;
  seq: number;
  nextSpawnAt: Record<string, number>;
  nextAuctionAt: number;
  players: PlayerState[];
  bases: BaseState[];
  brainrots: BrainrotInstance[];
  playerPos: { x: number; z: number };
}

export function save(g: Game, playerPos: { x: number; z: number }): void {
  try {
    const data: SaveData = {
      version: VERSION,
      savedAt: Date.now(),
      timeMs: g.state.timeMs,
      seq: g.state.seq,
      nextSpawnAt: g.state.nextSpawnAt,
      nextAuctionAt: g.state.nextAuctionAt,
      players: g.state.players,
      bases: g.state.bases,
      brainrots: g.state.brainrots,
      playerPos,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장 실패는 무시 (용량/시크릿 모드)
  }
}

export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== VERSION) {
      localStorage.removeItem(KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** 저장 적용 — 기존 state를 덮어쓴다 (경매는 폐기) */
export function apply(g: Game, data: SaveData): void {
  g.state.timeMs = data.timeMs;
  g.state.seq = data.seq;
  g.state.nextSpawnAt = data.nextSpawnAt;
  g.state.nextAuctionAt = Math.max(data.nextAuctionAt, data.timeMs + 60000);
  g.state.auction = null;
  g.state.players = data.players.map((pl) => ({ ...pl, carrying: null }));
  g.state.bases = data.bases;
  // 운반 중이던 브레인롯은 저장 시 소멸 (원작: 접속 종료 = 훔치기 무효)
  g.state.brainrots = data.brainrots
    .filter((i) => i.location !== 'carried')
    .map((i) => ({ ...i }));
  // 오래된 저장의 위치 맵 정리 (봇은 뷰가 다시 기록)
  for (const p of g.state.players) {
    g.state.positions[p.id] = g.state.positions[p.id] ?? { x: 0, z: 0 };
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
