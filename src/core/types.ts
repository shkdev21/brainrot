// 공유 타입 정의 — core 계층 전체에서 사용. DOM/three 의존 금지.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'god' | 'secret';

export interface BrainrotDef {
  id: string;
  rarity: Rarity;
  /** 초당 기본 수입 */
  baseIncome: number;
  /** 구매 가격 */
  price: number;
  /** 원작 출처명 (참고용, 표시하지 않음) */
  source: string;
  /** 경매 전용 등장 여부 */
  auctionOnly?: boolean;
}

export interface MutationDef {
  id: string;
  /** 수입 배율 */
  mult: number;
  colorHex: number;
  /** 자연 출현 가중치 (0 = 이벤트 전용) */
  weight: number;
  event?: boolean;
}

export type ToolKind =
  | 'melee'      // 근접 타격: 기절+넉백
  | 'trap'       // 설치형: 밟으면 루트
  | 'passive'    // 상시 효과
  | 'cloak'      // 은신 토글
  | 'aoeStun'    // 광역 기절
  | 'pull'       // 대상 끌어오기
  | 'turret'     // 설치 포탑
  | 'dash'       // 돌진 타격
  | 'blink';     // 순간이동

export interface ToolDef {
  id: string;
  name: string;
  unlockRebirth: number;
  price: number;
  kind: ToolKind;
  /** 쿨타임 ms */
  cooldownMs: number;
  /** 기절/지속 시간 ms (kind별 의미 상이) */
  powerMs: number;
  /** 반경/거리 (kind별 의미 상이) */
  range: number;
  desc: string;
}

export interface RebirthDef {
  level: number;
  requiredBrainrotIds: string[];
  requiredMoney: number;
}

export type Persona = 'raider' | 'guardian' | 'farmer';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  persona: Persona | null;
  skill: number;          // 봇 실력 0..1
  money: number;
  rebirth: number;
  slots: number;          // 기지 최대 브레인롯 수
  baseId: number;
  /** 들고 있는 브레인롯 스폰/슬롯 참조 */
  carrying: string | null;
  /** 절대 시간(ms) 상태 만료 시점 */
  stunUntil: number;
  slowUntil: number;
  invisUntil: number;
  unlockedTools: string[];
  purchasedTools: string[];
  toolCooldowns: Record<string, number>;
  /** 봇 입찰 상한 등 */
  botBidCeiling: number;
}

/** 카펫에 스폰되었거나 기지에 배치된 브레인롯 개체 */
export interface BrainrotInstance {
  uid: string;
  defId: string;
  mutation: string | null;
  ownerId: string | null;
  /** 카펫 스폰 | 기지 배치 | 바닥에 버려짐(무주공해) */
  location: 'carpet' | 'base' | 'dropped';
  slot: { baseId: number; floor: 1 | 2 | 3; index: number } | null;
  /** 구매 후 기지 걸어가는 중 */
  walkingUntil: number;
  /** 수입 개시 여부 (기지 도착 후) */
  earning: boolean;
}

export interface BaseState {
  id: number;
  ownerId: string;
  lockedUntil: number;
  lockCooldownUntil: number;
  unlockedFloors: 1 | 2 | 3;
}

export interface TrapInstance {
  id: string;
  ownerId: string;
  pos: { x: number; z: number };
  armed: boolean;
}

export interface TurretInstance {
  id: string;
  ownerId: string;
  pos: { x: number; z: number };
  expiresAt: number;
  nextFireAt: number;
}

export interface GameState {
  timeMs: number;
  seed: number;
  players: PlayerState[];
  bases: BaseState[];
  brainrots: BrainrotInstance[];
  traps: TrapInstance[];
  turrets: TurretInstance[];
  /** 다음 스폰 예정 시각 (등급별) */
  nextSpawnAt: Record<string, number>;
  nextAuctionAt: number;
  seq: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface ToolUseContext {
  aimDir: Vec2;
  pos: Vec2;
  targetId?: string;
}

/** 봇/플레이어 위치는 렌더 계층이 소유하되 core는 좌표를 받아 판정에 사용 */
export interface PositionMap {
  [playerId: string]: Vec2;
}
