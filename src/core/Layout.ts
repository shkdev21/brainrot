// 맵 좌표 규약 — core(봇 판정)와 render(메시 배치)이 공유하는 단일 소스.
// 원작 구조: 중앙을 남북으로 관통하는 레드카펫 거리 + 양옆 4채씩 8개 하우스 플롯.

export interface P2 {
  x: number;
  z: number;
}

/** 잔디 필드 경계 */
export const FIELD_X = 38;
export const FIELD_Z_MIN = -50;
export const FIELD_Z_MAX = 52;

/** 거리(차도) */
export const STREET_HALF_W = 12;
/** 레드카펫 */
export const CARPET_HALF_W = 3.5;
export const CARPET_FROM_Z = -42; // 북쪽 출입구(스폰)
export const CARPET_TO_Z = 44;    // 남쪽 끝

/** 하우스 플롯 */
export const PLOT_INNER_X = 13;   // 보도 경계(거리 쪽)
export const PLOT_OUTER_X = 35;   // 플롯 바깥 경계
export const PLOT_HALF_Z = 9.5;
export const HOUSE_X = 29.5;      // 집 중심 |x|
export const HOUSE_HALF_X = 4;
export const HOUSE_HALF_Z = 6;
export const FLOOR_H = 2.2;

export const BASE_COUNT = 8;

export function baseSide(i: number): -1 | 1 {
  return i < 4 ? -1 : 1;
}

export function baseCenter(i: number): P2 {
  const side = baseSide(i);
  const z = -28.5 + (i % 4) * 19;
  return { x: side * ((PLOT_INNER_X + PLOT_OUTER_X) / 2), z };
}

export function baseDoor(i: number): P2 {
  const c = baseCenter(i);
  const side = baseSide(i);
  return { x: side * (HOUSE_X - HOUSE_HALF_X - 0.5), z: c.z };
}

export function dist2d(a: P2, b: P2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** pos가 baseId 플롯 안인가 (사각 플롯, 집 포함) */
export function inBaseZone(pos: P2, baseId: number, margin = 0): boolean {
  const c = baseCenter(baseId);
  const side = baseSide(baseId);
  const minX = side < 0 ? -PLOT_OUTER_X - margin : PLOT_INNER_X - margin;
  const maxX = side < 0 ? -PLOT_INNER_X + margin : PLOT_OUTER_X + margin;
  return (
    pos.x >= minX && pos.x <= maxX &&
    Math.abs(pos.z - c.z) <= PLOT_HALF_Z + margin
  );
}

export function inCarpetZone(pos: P2, margin = 0): boolean {
  return (
    Math.abs(pos.x) <= CARPET_HALF_W + margin &&
    pos.z >= CARPET_FROM_Z - margin && pos.z <= CARPET_TO_Z + margin
  );
}

/** 카펫 위 걷기 진행도(0~1) → 위치 */
export function carpetWalkPos(t: number): P2 {
  const z = CARPET_FROM_Z + 2 + t * (CARPET_TO_Z - CARPET_FROM_Z - 4);
  return { x: 0, z };
}

export const CARPET_WALK_MS = 26000; // 북→남 걷는 시간

export function clampToIsland(pos: P2): P2 {
  return {
    x: Math.max(-FIELD_X + 1, Math.min(FIELD_X - 1, pos.x)),
    z: Math.max(FIELD_Z_MIN + 1, Math.min(FIELD_Z_MAX - 1, pos.z)),
  };
}
