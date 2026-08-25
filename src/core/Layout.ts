// 맵 좌표 규약 — core(봇 판정)와 render(메시 배치)가 공유하는 단일 소스.

export const ISLAND_RADIUS = 70;
export const BASE_RING_RADIUS = 42;
export const BASE_COUNT = 8;
/** 기지 외벽 크기 (xz 평면) */
export const BASE_HALF_W = 8;
export const BASE_HALF_D = 7;
/** 문(현관) 위치: 중심에서 섬 중앙 방향으로 이동 */
export const DOOR_OFFSET = 7.5;

export interface P2 {
  x: number;
  z: number;
}

export function baseCenter(i: number): P2 {
  const a = (i / BASE_COUNT) * Math.PI * 2;
  return { x: Math.sin(a) * BASE_RING_RADIUS, z: Math.cos(a) * BASE_RING_RADIUS };
}

export function baseDoor(i: number): P2 {
  const c = baseCenter(i);
  const len = Math.hypot(c.x, c.z);
  const t = (1 - DOOR_OFFSET / len);
  return { x: c.x * t, z: c.z * t };
}

/** 레드카펫: 섬 중앙 남북 스트립 */
export const CARPET_HALF_W = 3;
export const CARPET_HALF_L = 18;

export function carpetSpot(slot: number): P2 {
  // 카펫 위 스폰 위치 (좌우 교차)
  const row = Math.floor(slot / 2);
  const col = slot % 2 === 0 ? -1 : 1;
  return { x: col * 1.5, z: -CARPET_HALF_L + 6 + row * 5 };
}

export function dist2d(a: P2, b: P2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** pos가 baseId 기지 구역(AABB) 안인가 */
export function inBaseZone(pos: P2, baseId: number, margin = 0): boolean {
  const c = baseCenter(baseId);
  return (
    Math.abs(pos.x - c.x) <= BASE_HALF_W + margin &&
    Math.abs(pos.z - c.z) <= BASE_HALF_D + margin
  );
}

export function inCarpetZone(pos: P2, margin = 0): boolean {
  return (
    Math.abs(pos.x) <= CARPET_HALF_W + margin &&
    Math.abs(pos.z) <= CARPET_HALF_L + margin
  );
}

export function clampToIsland(pos: P2): P2 {
  const len = Math.hypot(pos.x, pos.z);
  if (len <= ISLAND_RADIUS - 1) return pos;
  const t = (ISLAND_RADIUS - 1) / len;
  return { x: pos.x * t, z: pos.z * t };
}
