import * as THREE from 'three';
import {
  ISLAND_RADIUS, BASE_RING_RADIUS, BASE_COUNT, BASE_HALF_W, BASE_HALF_D,
  CARPET_HALF_L, carpetSpot,
} from '../core/Layout';

// 맵 빌더 — 섬, 레드카펫, 8개 기지(계단식 테라스), 장식, 충돌 세그먼트.

export interface Seg {
  x1: number; z1: number; x2: number; z2: number;
  /** 문 통과 허용 세그먼트(잠금 검사용 마커) */
  door?: { baseId: number };
}

export interface MapRefs {
  colliders: Seg[];
  /** 위치의 지면 높이 (기지 테라스 반영) */
  groundHeight: (x: number, z: number) => number;
  carpetSpots: THREE.Vector3[];
  /** 기지별 슬롯 위치 (30개: 층당 10) */
  slotPos: (baseId: number, slotIndex: number) => THREE.Vector3;
  lockPadPos: (baseId: number) => THREE.Vector3;
  doorCenter: (baseId: number) => THREE.Vector3;
  /** 환생으로 층 해금 시 재구성 */
  setFloors: (baseId: number, floors: 1 | 2 | 3) => void;
}

const BASE_COLORS = [
  0xff6b6b, 0x4ecdc4, 0xffd93d, 0x6a67ce,
  0xff9f43, 0x2e86de, 0xf368e0, 0x26de81,
];

const FLOOR_H = 2.4;
const WALL_H = 3.2;
const DOOR_GAP = 6.5;
const SLOT_PER_FLOOR = 10;

export function buildMap(scene: THREE.Scene): MapRefs {
  const colliders: Seg[] = [];
  const unlocked = new Map<number, 1 | 2 | 3>();
  const floorGroups = new Map<number, THREE.Group[]>();

  // ── 지면 ────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 4, 6, 48),
    new THREE.MeshLambertMaterial({ color: 0x6fbf4f }),
  );
  ground.position.y = -3;
  ground.receiveShadow = true;
  scene.add(ground);

  // 섬 테두리 모래
  const sand = new THREE.Mesh(
    new THREE.TorusGeometry(ISLAND_RADIUS - 2.2, 1.8, 8, 64).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xf7e8b0 }),
  );
  sand.position.y = 0.15;
  scene.add(sand);

  // ── 중앙 광장 + 레드카펫 ──────────────────────────────────
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(26, 40).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xe8e2d5 }),
  );
  plaza.position.y = 0.05;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(6, CARPET_HALF_L * 2).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xd93636 }),
  );
  carpet.position.y = 0.1;
  carpet.receiveShadow = true;
  scene.add(carpet);
  for (const edgeZ of [-CARPET_HALF_L, CARPET_HALF_L]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.3, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    trim.position.set(0, 0.2, edgeZ);
    scene.add(trim);
  }

  // 카펫 스폰 자리 (6개)
  const carpetSpots: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const p = carpetSpot(i);
    carpetSpots.push(new THREE.Vector3(p.x, 0, p.z));
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, 0.25, 16),
      new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }),
    );
    pad.position.set(p.x, 0.18, p.z);
    pad.receiveShadow = true;
    scene.add(pad);
  }

  // ── 기지 8개 ────────────────────────────────────────────
  const lockPads: THREE.Vector3[] = [];
  const doors: THREE.Vector3[] = [];
  const slotCache: THREE.Vector3[][] = [];

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf0ead6 });

  for (let i = 0; i < BASE_COUNT; i++) {
    const a = (i / BASE_COUNT) * Math.PI * 2;
    const cx = Math.sin(a) * BASE_RING_RADIUS;
    const cz = Math.cos(a) * BASE_RING_RADIUS;
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    group.rotation.y = -a; // 로컬 +z가 전방(중심)을 향하도록
    scene.add(group);

    // 바닥판 (전체 테라스 기반)
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_HALF_W * 2, 0.5, BASE_HALF_D * 2),
      new THREE.MeshLambertMaterial({ color: 0xcfc7b4 }),
    );
    slab.position.y = 0.25;
    slab.receiveShadow = true;
    group.add(slab);

    // 지붕 없음(오픈) — 등급색 포스트 4개
    const postColor = BASE_COLORS[i];
    for (const [px, pz] of [
      [-BASE_HALF_W + 0.6, BASE_HALF_D - 0.6], [BASE_HALF_W - 0.6, BASE_HALF_D - 0.6],
      [-BASE_HALF_W + 0.6, -BASE_HALF_D + 0.6], [BASE_HALF_W - 0.6, -BASE_HALF_D + 0.6],
    ] as const) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, WALL_H + FLOOR_H * 2, 0.8),
        new THREE.MeshLambertMaterial({ color: postColor }),
      );
      post.position.set(px, (WALL_H + FLOOR_H * 2) / 2, pz);
      post.castShadow = true;
      group.add(post);
    }

    // 후벽(뒤쪽, 로컬 -z) — 세그먼트는 월드 좌표로 계산해 추가
    const worldSeg = (lx1: number, lz1: number, lx2: number, lz2: number) => {
      // 로컬→월드: 회전 -a
      const rot = (x: number, z: number) => ({
        x: cx + x * Math.cos(-a) - z * Math.sin(-a),
        z: cz + x * Math.sin(-a) + z * Math.cos(-a),
      });
      const p1 = rot(lx1, lz1);
      const p2 = rot(lx2, lz2);
      colliders.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z });
    };

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_HALF_W * 2, WALL_H + FLOOR_H * 2, 1),
      wallMat,
    );
    backWall.position.set(0, (WALL_H + FLOOR_H * 2) / 2, -BASE_HALF_D + 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);
    worldSeg(-BASE_HALF_W + 0.5, -BASE_HALF_D + 0.5, BASE_HALF_W - 0.5, -BASE_HALF_D + 0.5);

    // 측벽 2개
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry(1, WALL_H + FLOOR_H * 2, BASE_HALF_D * 2),
        wallMat,
      );
      side.position.set(sx * (BASE_HALF_W - 0.5), (WALL_H + FLOOR_H * 2) / 2, 0);
      side.castShadow = true;
      group.add(side);
      worldSeg(
        sx * (BASE_HALF_W - 0.5), -BASE_HALF_D + 0.5,
        sx * (BASE_HALF_W - 0.5), BASE_HALF_D - 0.5,
      );
    }

    // 전면(문 쪽, 로컬 +z): 좌우 벽 + 가운데 문틀, 문 자리는 표시만
    const frontSegW = BASE_HALF_W - DOOR_GAP / 2;
    for (const sx of [-1, 1]) {
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(frontSegW, WALL_H, 1),
        wallMat,
      );
      front.position.set(
        sx * (DOOR_GAP / 2 + frontSegW / 2), WALL_H / 2, BASE_HALF_D - 0.5,
      );
      front.castShadow = true;
      group.add(front);
      worldSeg(
        sx * DOOR_GAP / 2, BASE_HALF_D - 0.5,
        sx * BASE_HALF_W - (sx > 0 ? 0.5 : -0.5), BASE_HALF_D - 0.5,
      );
    }
    // 문 위치(월드) — 잠금 판정 마커
    const doorLocal = { x: 0, z: BASE_HALF_D - 1 };
    const rotDoor = {
      x: cx + doorLocal.x * Math.cos(-a) - doorLocal.z * Math.sin(-a),
      z: cz + doorLocal.x * Math.sin(-a) + doorLocal.z * Math.cos(-a),
    };
    doors[i] = new THREE.Vector3(rotDoor.x, 0, rotDoor.z);

    // 잠금 패드 — 문 안쪽 바닥
    const padLocal = { x: 0, z: BASE_HALF_D - 2.6 };
    const rotPad = {
      x: cx + padLocal.x * Math.cos(-a) - padLocal.z * Math.sin(-a),
      z: cz + padLocal.x * Math.sin(-a) + padLocal.z * Math.cos(-a),
    };
    lockPads[i] = new THREE.Vector3(rotPad.x, 0.55, rotPad.z);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16),
      new THREE.MeshLambertMaterial({ color: 0x9aa4b0 }),
    );
    // 로컬 좌표로 추가
    pad.position.set(0, 0.6, BASE_HALF_D - 2.6);
    group.add(pad);

    // 테라스 층 그룹 (2, 3층 — 해금 시 표시)
    const terraces: THREE.Group[] = [];
    for (const f of [2, 3] as const) {
      const tg = new THREE.Group();
      tg.visible = false;
      const depth = BASE_HALF_D * 2 / 3;
      const tz = BASE_HALF_D - depth * (f - 1) - depth / 2; // 뒤에서부터
      const plat = new THREE.Mesh(
        new THREE.BoxGeometry(BASE_HALF_W * 2 - 1, FLOOR_H, depth),
        new THREE.MeshLambertMaterial({ color: 0xbdb49e }),
      );
      plat.position.set(0, FLOOR_H * (f - 1) + FLOOR_H / 2, tz);
      plat.castShadow = true;
      plat.receiveShadow = true;
      tg.add(plat);
      // 계단(전면 접근)
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(4, FLOOR_H * (f - 1) / steps, 0.8),
          new THREE.MeshLambertMaterial({ color: 0xa89f8a }),
        );
        step.position.set(
          -BASE_HALF_W + 3,
          (FLOOR_H * (f - 1) / steps) * (s + 0.5),
          tz + depth / 2 + (steps - s) * 0.8,
        );
        tg.add(step);
      }
      group.add(tg);
      terraces.push(tg);
    }
    floorGroups.set(i, terraces);
    unlocked.set(i, 1);

    // 슬롯 위치 (로컬→월드, 층별 10개)
    // 1층: 전방 테라스(z 양수), 2층: 중앙(y=FLOOR_H), 3층: 후방(y=FLOOR_H*2)
    const slots: THREE.Vector3[] = [];
    for (let s = 0; s < SLOT_PER_FLOOR * 3; s++) {
      const floor = Math.floor(s / SLOT_PER_FLOOR); // 0,1,2
      const idxIn = s % SLOT_PER_FLOOR;
      const lx = (idxIn % 5) * 2.6 - 5.2;
      const lz = (Math.floor(idxIn / 5) === 0 ? 1 : -1) * 1.6 +
        (BASE_HALF_D - 2.4) - floor * (BASE_HALF_D * 2 / 3);
      const y = floor * FLOOR_H;
      const rot = {
        x: cx + lx * Math.cos(-a) - lz * Math.sin(-a),
        z: cz + lx * Math.sin(-a) + lz * Math.cos(-a),
      };
      slots.push(new THREE.Vector3(rot.x, y + 0.5, rot.z));
    }
    slotCache[i] = slots;
  }

  // ── 장식: 나무와 가로등 ──────────────────────────────────
  const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
  const treeLeafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x555f6e });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xfff1a8 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.22;
    const r = 33 + (i % 3) * 3;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (i % 2 === 0) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 8), treeTrunkMat);
      trunk.position.set(x, 1.5, z);
      trunk.castShadow = true;
      scene.add(trunk);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 8), treeLeafMat);
      leaf.position.set(x, 5, z);
      leaf.castShadow = true;
      scene.add(leaf);
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4.4, 6), lampMat);
      pole.position.set(x, 2.2, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), bulbMat);
      bulb.position.set(x, 4.6, z);
      scene.add(bulb);
    }
  }

  // ── 지면 높이 함수 (테라스+계단 근사) ─────────────────────
  const groundHeight = (x: number, z: number): number => {
    for (let i = 0; i < BASE_COUNT; i++) {
      const a = (i / BASE_COUNT) * Math.PI * 2;
      const cx = Math.sin(a) * BASE_RING_RADIUS;
      const cz = Math.cos(a) * BASE_RING_RADIUS;
      const fx = -Math.sin(a);
      const fz = -Math.cos(a);
      const dx = x - cx;
      const dz = z - cz;
      const alongF = dx * fx + dz * fz; // 전방 거리 (+: 중심 쪽)
      const alongR = dx * -fz + dz * fx;
      if (Math.abs(alongR) > BASE_HALF_W || Math.abs(alongF) > BASE_HALF_D) continue;
      const floors = unlocked.get(i) ?? 1;
      // 로컬 z(전방 +): 1층 zone: alongF > -BASE_HALF_D/3 …
      // 테라스 경계: 후방 1/3 → 3층, 중앙 1/3 → 2층, 전방 1/3 → 1층
      const localZ = alongF; // -D..+D
      const third = (BASE_HALF_D * 2) / 3;
      const zoneFromBack = BASE_HALF_D - localZ; // 0(뒤)~2D(앞)
      let floor = 1;
      if (floors >= 3 && zoneFromBack < third) floor = 3;
      else if (floors >= 2 && zoneFromBack < third * 2) floor = 2;
      // 계단 완화: 층 경계 근처는 중간 높이로 보간 (밟아 올라가는 느낌)
      const baseH = (floor - 1) * FLOOR_H;
      const edgeProximity = Math.min(
        Math.abs(zoneFromBack - third * (floor === 1 ? 2 : floor === 2 ? 1 : 0)),
        Math.abs(zoneFromBack - third * (floor === 1 ? 2 : floor === 3 ? 1 : floor === 2 ? 2 : 1)),
      );
      if (edgeProximity < 1.2) {
        return baseH; // 계단 구간은 단순 목표 높이 유지 (컨트롤러가 보간)
      }
      return baseH;
    }
    return 0;
  };

  return {
    colliders,
    groundHeight,
    carpetSpots,
    slotPos: (baseId, slotIndex) => slotCache[baseId][Math.min(slotIndex, 29)],
    lockPadPos: (baseId) => lockPads[baseId],
    doorCenter: (baseId) => doors[baseId],
    setFloors: (baseId, floors) => {
      unlocked.set(baseId, floors);
      const terraces = floorGroups.get(baseId)!;
      terraces[0].visible = floors >= 2;
      terraces[1].visible = floors >= 3;
    },
  };
}

/** 원-세그먼트 충돌 해결 — 플레이어 밀어내기 */
export function resolveCollisions(
  pos: THREE.Vector3,
  radius: number,
  colliders: Seg[],
): void {
  for (const s of colliders) {
    const dx = s.x2 - s.x1;
    const dz = s.z2 - s.z1;
    const len2 = dx * dx + dz * dz;
    let t = ((pos.x - s.x1) * dx + (pos.z - s.z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = s.x1 + t * dx;
    const pz = s.z1 + t * dz;
    let ox = pos.x - px;
    let oz = pos.z - pz;
    const d = Math.hypot(ox, oz);
    if (d < radius && d > 0.0001) {
      const push = (radius - d) / d;
      pos.x += ox * push;
      pos.z += oz * push;
    }
  }
  // 섬 경계
  const r = Math.hypot(pos.x, pos.z);
  if (r > ISLAND_RADIUS - 2) {
    const t = (ISLAND_RADIUS - 2) / r;
    pos.x *= t;
    pos.z *= t;
  }
}
