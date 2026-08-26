import * as THREE from 'three';
import { studMaterial } from './StudTexture';
import {
  FIELD_X, FIELD_Z_MIN, FIELD_Z_MAX, STREET_HALF_W, CARPET_HALF_W,
  CARPET_FROM_Z, CARPET_TO_Z, PLOT_INNER_X, PLOT_OUTER_X, PLOT_HALF_Z,
  BASE_COUNT, baseSide, baseCenter,
} from '../core/Layout';

// 맵 빌더 — 원작 스타일: 중앙 레드카펫 거리 + 양옆 "계단식 전시 플랫폼" 기지.
// 기지 = 콘크리트 티어(1~3층) + 유리 전면(잠금 표시) + 후벽 이름 간판.

export interface Seg {
  x1: number; z1: number; x2: number; z2: number;
}

export interface MapRefs {
  colliders: Seg[];
  groundHeight: (x: number, z: number) => number;
  carpetStart: THREE.Vector3;
  carpetEnd: THREE.Vector3;
  slotPos: (baseId: number, slotIndex: number) => THREE.Vector3;
  lockPadPos: (baseId: number) => THREE.Vector3;
  doorCenter: (baseId: number) => THREE.Vector3;
  setFloors: (baseId: number, floors: 1 | 2 | 3) => void;
  setBaseLocked: (baseId: number, locked: boolean) => void;
}

const BASE_TRIM = [
  0xff7b54, 0x4ecdc4, 0xffd93d, 0x6c5ce7,
  0xff9ff3, 0x2e86de, 0xf9ca24, 0x26de81,
];
const SLOT_PER_FLOOR = 10;
const NAVY = 0x1e3a5f;        // 원작 기지 프레임 네이비
const MAT_BEIGE = '#d8c8a8';  // 전시 매트 바닥
const MAT_STUD = '#e6d7b8';
const GLASS_OPEN = 0x9fd8ff;
const GLASS_LOCKED = 0xff5252;

/** 티어 경계(|x| 기준): 13~24 1층 / 24~30 2층 / 30~35 3층 */
const TIER1_X = 24;
const TIER2_X = 30;
const TIER_H = 2.6;

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildMap(scene: THREE.Scene, ownerNames?: string[]): MapRefs {
  const colliders: Seg[] = [];
  const unlocked = new Map<number, 1 | 2 | 3>();
  const glassMats = new Map<number, THREE.MeshLambertMaterial[]>();
  const tierGroups = new Map<number, { t2: THREE.Group; t3: THREE.Group }>();

  // ── 지면: 밝은 라임 잔디 ─────────────────────────────────
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_X * 2, 1, FIELD_Z_MAX - FIELD_Z_MIN),
    studMaterial('#7ec850', '#8fdb5f', FIELD_X * 2, FIELD_Z_MAX - FIELD_Z_MIN),
  );
  grass.position.set(0, -0.5, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  grass.receiveShadow = true;
  scene.add(grass);

  // ── 거리: 아스팔트 + 보도 ─────────────────────────────────
  const street = new THREE.Mesh(
    new THREE.BoxGeometry(STREET_HALF_W * 2 + 4, 0.3, FIELD_Z_MAX - FIELD_Z_MIN - 4),
    studMaterial('#8a8f98', '#9aa0aa', STREET_HALF_W * 2 + 4, FIELD_Z_MAX - FIELD_Z_MIN - 4),
  );
  street.position.set(0, 0.05, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  street.receiveShadow = true;
  scene.add(street);
  const walkMat = lambert(0xd5d8dd);
  for (const s of [-1, 1]) {
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.5, FIELD_Z_MAX - FIELD_Z_MIN - 4),
      walkMat,
    );
    walk.position.set(s * (STREET_HALF_W + 2), 0.15, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
    walk.receiveShadow = true;
    scene.add(walk);
  }

  // ── 레드카펫 (황금 테두리+스탠션) ─────────────────────────
  const carpet = new THREE.Mesh(
    new THREE.BoxGeometry(CARPET_HALF_W * 2, 0.36, CARPET_TO_Z - CARPET_FROM_Z + 6),
    studMaterial('#e03131', '#f04a4a', CARPET_HALF_W * 2, CARPET_TO_Z - CARPET_FROM_Z + 6),
  );
  carpet.position.set(0, 0.24, (CARPET_TO_Z + CARPET_FROM_Z) / 2);
  carpet.receiveShadow = true;
  scene.add(carpet);
  for (const s of [-1, 1]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, CARPET_TO_Z - CARPET_FROM_Z + 6),
      lambert(0xfce96a),
    );
    trim.position.set(s * (CARPET_HALF_W + 0.25), 0.3, (CARPET_TO_Z + CARPET_FROM_Z) / 2);
    scene.add(trim);
  }
  const goldMat = lambert(0xd4a017);
  for (let z = CARPET_FROM_Z + 8; z <= CARPET_TO_Z - 4; z += 10) {
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.3, 8), goldMat);
      post.position.set(s * (CARPET_HALF_W + 0.9), 0.75, z);
      post.castShadow = true;
      scene.add(post);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), goldMat);
      ball.position.set(s * (CARPET_HALF_W + 0.9), 1.5, z);
      scene.add(ball);
    }
  }

  // ── 북쪽 스폰 구조물 ──────────────────────────────────────
  const spawnWall = new THREE.Mesh(new THREE.BoxGeometry(16, 7.5, 2.4), lambert(0x8b5a2b));
  spawnWall.position.set(0, 3.75, CARPET_FROM_Z - 2.6);
  spawnWall.castShadow = true;
  scene.add(spawnWall);
  const doorway = new THREE.Mesh(
    new THREE.BoxGeometry(CARPET_HALF_W * 2 + 1.2, 4.6, 0.8),
    lambert(0x2b1d12),
  );
  doorway.position.set(0, 2.3, CARPET_FROM_Z - 1.3);
  scene.add(doorway);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(11, 2.4, 0.6), lambert(0x1e6fd9));
  sign.position.set(0, 8.6, CARPET_FROM_Z - 2.6);
  scene.add(sign);
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 112;
  const sctx = signCanvas.getContext('2d')!;
  sctx.fillStyle = '#1e6fd9'; sctx.fillRect(0, 0, 512, 112);
  sctx.font = 'bold 62px sans-serif'; sctx.fillStyle = '#fff'; sctx.textAlign = 'center';
  sctx.fillText('LIKE THE GAME', 256, 82);
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(10.6, 2.3),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) }),
  );
  signFace.position.set(0, 8.6, CARPET_FROM_Z - 2.25);
  scene.add(signFace);

  // ── 8개 계단식 전시 기지 ──────────────────────────────────
  for (let i = 0; i < BASE_COUNT; i++) {
    const side = baseSide(i);
    const c = baseCenter(i);
    const root = new THREE.Group();
    root.position.set(0, 0, 0); // 절대좌표로 배치
    scene.add(root);
    const S = (x: number) => side * x; // side 부호 헬퍼

    // ── 1층: 지면 레벨 콘크리트 판 ────────────────────────
    const slab1 = new THREE.Mesh(
      new THREE.BoxGeometry(TIER1_X - PLOT_INNER_X + 1, 0.5, PLOT_HALF_Z * 2),
      studMaterial(MAT_BEIGE, MAT_STUD, TIER1_X - PLOT_INNER_X + 1, PLOT_HALF_Z * 2),
    );
    slab1.position.set(S((PLOT_INNER_X + TIER1_X) / 2 - 0.5), 0.25, c.z);
    slab1.receiveShadow = true;
    root.add(slab1);

    // ── 2층 티어 (해금 시) ────────────────────────────────
    const t2 = new THREE.Group();
    t2.visible = false;
    const slab2 = new THREE.Mesh(
      new THREE.BoxGeometry(TIER2_X - TIER1_X, TIER_H + 0.5, PLOT_HALF_Z * 2),
      studMaterial(MAT_BEIGE, MAT_STUD, TIER2_X - TIER1_X, PLOT_HALF_Z * 2),
    );
    slab2.position.set(S((TIER1_X + TIER2_X) / 2), (TIER_H + 0.5) / 2, c.z);
    slab2.castShadow = true;
    slab2.receiveShadow = true;
    t2.add(slab2);
    root.add(t2);

    // ── 3층 티어 (해금 시) ────────────────────────────────
    const t3 = new THREE.Group();
    t3.visible = false;
    const slab3 = new THREE.Mesh(
      new THREE.BoxGeometry(PLOT_OUTER_X - TIER2_X, TIER_H * 2 + 0.5, PLOT_HALF_Z * 2),
      studMaterial(MAT_BEIGE, MAT_STUD, PLOT_OUTER_X - TIER2_X, PLOT_HALF_Z * 2),
    );
    slab3.position.set(S((TIER2_X + PLOT_OUTER_X) / 2), (TIER_H * 2 + 0.5) / 2, c.z);
    slab3.castShadow = true;
    slab3.receiveShadow = true;
    t3.add(slab3);
    root.add(t3);
    tierGroups.set(i, { t2, t3 });

    // ── 후벽 타워: 이름 간판 ─────────────────────────────
    const trimColor = BASE_TRIM[i];
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 9.2, PLOT_HALF_Z * 2),
      lambert(NAVY),
    );
    backWall.position.set(S(PLOT_OUTER_X - 0.6), 4.6, c.z);
    backWall.castShadow = true;
    root.add(backWall);
    // 후벽 충돌
    colliders.push(
      { x1: S(PLOT_OUTER_X - 1.2), z1: c.z - PLOT_HALF_Z, x2: S(PLOT_OUTER_X - 1.2), z2: c.z + PLOT_HALF_Z },
    );

    // 이름 간판 (캔버스)
    const name = ownerNames?.[i] ?? `기지 ${i + 1}`;
    const nc = document.createElement('canvas');
    nc.width = 256; nc.height = 96;
    const nctx = nc.getContext('2d')!;
    nctx.fillStyle = '#1e3a5f'; nctx.fillRect(0, 0, 256, 96);
    nctx.fillStyle = '#ffd43b'; nctx.fillRect(0, 0, 256, 14);
    nctx.font = 'bold 44px sans-serif'; nctx.fillStyle = '#fff';
    nctx.textAlign = 'center'; nctx.textBaseline = 'middle';
    nctx.fillText(name, 128, 58);
    const nameSign = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 2.8),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc) }),
    );
    // 거리 쪽에서 보이도록 방향
    const signDir = side < 0 ? 1 : -1;
    nameSign.position.set(S(PLOT_OUTER_X - 1.25), 6.6, c.z);
    nameSign.rotation.y = signDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(nameSign);
    // 트림 라인 (기지 색)
    const trimBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.7, PLOT_HALF_Z * 2),
      lambert(trimColor),
    );
    trimBar.position.set(S(PLOT_OUTER_X - 0.6), 9.3, c.z);
    root.add(trimBar);
    const trimBarWhite = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.18, PLOT_HALF_Z * 2),
      lambert(0xffffff),
    );
    trimBarWhite.position.set(S(PLOT_OUTER_X - 0.6), 8.9, c.z);
    root.add(trimBarWhite);

    // ── 유리 전면 패널 (잠금 표시) ────────────────────────
    const glasses: THREE.MeshLambertMaterial[] = [];
    const glassFront = (
      cx: number, cy: number, w: number, h: number,
    ) => {
      const mat = new THREE.MeshLambertMaterial({
        color: GLASS_OPEN, transparent: true, opacity: 0.45,
      });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, w), mat);
      panel.position.set(S(cx), cy, c.z);
      root.add(panel);
      glasses.push(mat);
    };
    // 1층 전면: 낮은 유리 가드레일 (출입은 열림 상태에서 자유)
    glassFront(PLOT_INNER_X + 0.3, 0.85, PLOT_HALF_Z * 2 - 1, 1.2);
    // 흰 전면 테두리 (원작 디스플레이 박스 화이트 라인)
    const whiteTrim = (cx: number, cy: number) => {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.22, PLOT_HALF_Z * 2),
        lambert(0xffffff),
      );
      trim.position.set(S(cx), cy, c.z);
      root.add(trim);
    };
    whiteTrim(PLOT_INNER_X + 0.3, 0.42);
    const trim2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, PLOT_HALF_Z * 2),
      lambert(0xffffff),
    );
    trim2.position.set(S(TIER1_X + 0.15), TIER_H + 0.12, c.z);
    t2.add(trim2);
    const trim3 = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, PLOT_HALF_Z * 2),
      lambert(0xffffff),
    );
    trim3.position.set(S(TIER2_X + 0.15), TIER_H * 2 + 0.12, c.z);
    t3.add(trim3);

    // 2·3층 전면 가드레일
    const rail2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.1, PLOT_HALF_Z * 2),
      new THREE.MeshLambertMaterial({ color: GLASS_OPEN, transparent: true, opacity: 0.4 }),
    );
    rail2.position.set(S(TIER1_X + 0.15), TIER_H + 0.55, c.z);
    t2.add(rail2);
    glasses.push(rail2.material as THREE.MeshLambertMaterial);
    const rail3 = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.1, PLOT_HALF_Z * 2),
      new THREE.MeshLambertMaterial({ color: GLASS_OPEN, transparent: true, opacity: 0.4 }),
    );
    rail3.position.set(S(TIER2_X + 0.15), TIER_H * 2 + 0.55, c.z);
    t3.add(rail3);
    glasses.push(rail3.material as THREE.MeshLambertMaterial);
    glassMats.set(i, glasses);

    // ── 측벽 (양옆 저벽, 티어 높이 따라) ─────────────────
    for (const sz of [-1, 1]) {
      const side1 = new THREE.Mesh(
        new THREE.BoxGeometry(TIER1_X - PLOT_INNER_X, 1.0, 0.6),
        lambert(NAVY),
      );
      side1.position.set(S((PLOT_INNER_X + TIER1_X) / 2), 0.5, c.z + sz * PLOT_HALF_Z);
      root.add(side1);
      const side2 = new THREE.Mesh(
        new THREE.BoxGeometry(TIER2_X - TIER1_X, TIER_H + 1.0, 0.6),
        lambert(NAVY),
      );
      side2.position.set(S((TIER1_X + TIER2_X) / 2), (TIER_H + 1) / 2, c.z + sz * PLOT_HALF_Z);
      t2.add(side2);
      const side3 = new THREE.Mesh(
        new THREE.BoxGeometry(PLOT_OUTER_X - TIER2_X, TIER_H * 2 + 1, 0.6),
        lambert(NAVY),
      );
      side3.position.set(S((TIER2_X + PLOT_OUTER_X) / 2), (TIER_H * 2 + 1) / 2, c.z + sz * PLOT_HALF_Z);
      t3.add(side3);
    }

    // ── 티어 사이 계단 (z 양쪽 가장자리, 번갈아) ───────────
    const stairEdgeZ = c.z + (i % 2 === 0 ? 1 : -1) * (PLOT_HALF_Z - 1.2);
    for (let s = 0; s < 5; s++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, (TIER_H / 5) * (s + 1), 1.8),
        lambert(NAVY),
      );
      step.position.set(S(TIER1_X - 0.45 - s * 0.9), (TIER_H / 5) * (s + 1) / 2, stairEdgeZ);
      root.add(step);
    }
    for (let s = 0; s < 5; s++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, (TIER_H / 5) * (s + 1), 1.8),
        lambert(NAVY),
      );
      step.position.set(S(TIER2_X - 0.45 - s * 0.9), TIER_H + (TIER_H / 5) * (s + 1) / 2, stairEdgeZ);
      root.add(step);
    }

    // ── 잠금 패드 (전면 유리 안쪽) ────────────────────────
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.26, 14),
      lambert(0x7f8c9b),
    );
    pad.position.set(S(PLOT_INNER_X + 1.8), 0.55, c.z + (i % 2 === 0 ? 1 : -1) * 3);
    root.add(pad);
    const padIcon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), lambert(0x2d3436));
    padIcon.position.set(S(PLOT_INNER_X + 1.8), 0.95, c.z + (i % 2 === 0 ? 1 : -1) * 3);
    root.add(padIcon);

    unlocked.set(i, 1);
  }

  // ── 슬롯 위치: 층×2행×5열 ─────────────────────────────────
  const slotCache: THREE.Vector3[][] = [];
  for (let i = 0; i < BASE_COUNT; i++) {
    const side = baseSide(i);
    const c = baseCenter(i);
    const slots: THREE.Vector3[] = [];
    for (let s = 0; s < SLOT_PER_FLOOR * 3; s++) {
      const floor = Math.floor(s / SLOT_PER_FLOOR);
      const k = s % SLOT_PER_FLOOR;
      const col = k % 5;
      const rowD = Math.floor(k / 5);
      const x = 16.2 + floor * 5.6 + rowD * 2.8;
      const z = c.z + (col - 2) * 3.4;
      const y = floor * TIER_H;
      slots.push(new THREE.Vector3(side * x, y + 0.5, z));
    }
    slotCache[i] = slots;
  }

  // ── 지면 높이: 계단식 티어 ────────────────────────────────
  const groundHeight = (x: number, z: number): number => {
    for (let i = 0; i < BASE_COUNT; i++) {
      const c = baseCenter(i);
      if (Math.abs(z - c.z) > PLOT_HALF_Z) continue;
      const side = baseSide(i);
      const ax = Math.abs(x);
      if (ax < PLOT_INNER_X - 1 || ax > PLOT_OUTER_X) continue;
      if (Math.sign(x) !== side) continue;
      const floors = unlocked.get(i) ?? 1;
      // 계단 구간 근사: 티어 경계 ±0.9에서 선형 보간 (컨트롤러가 착지 보정)
      const lerpBand = (edge: number, lower: number, upper: number) => {
        if (ax < edge - 0.9) return lower;
        if (ax > edge + 0.9) return upper;
        const t = (ax - (edge - 0.9)) / 1.8;
        return lower + (upper - lower) * t;
      };
      if (floors >= 3 && ax > TIER2_X - 0.9) {
        return lerpBand(TIER2_X, TIER_H, TIER_H * 2);
      }
      if (floors >= 2 && ax > TIER1_X - 0.9) {
        return lerpBand(TIER1_X, 0, TIER_H);
      }
      return 0;
    }
    return 0;
  };

  // ── 필드 경계 울타리 ──────────────────────────────────────
  const fenceMat = lambert(0xa9b6c2);
  const addFence = (x1: number, z1: number, x2: number, z2: number) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(0.3, Math.abs(x2 - x1)), 1.5, Math.max(0.3, Math.abs(z2 - z1)),
      ),
      fenceMat,
    );
    mesh.position.set((x1 + x2) / 2, 0.75, (z1 + z2) / 2);
    scene.add(mesh);
    colliders.push({ x1, z1, x2, z2 });
  };
  addFence(-FIELD_X, FIELD_Z_MIN, FIELD_X, FIELD_Z_MIN);
  addFence(-FIELD_X, FIELD_Z_MAX, FIELD_X, FIELD_Z_MAX);
  addFence(-FIELD_X, FIELD_Z_MIN, -FIELD_X, FIELD_Z_MAX);
  addFence(FIELD_X, FIELD_Z_MIN, FIELD_X, FIELD_Z_MAX);
  addFence(-8.2, CARPET_FROM_Z - 3.8, 8.2, CARPET_FROM_Z - 3.8);

  // ── 가로수/가로등 ────────────────────────────────────────
  const trunkMat = lambert(0x8a5a33);
  const leafMat = lambert(0x2f9e44);
  const lampMat = lambert(0x57606f);
  const bulbMat = lambert(0xffe066);
  let deco = 0;
  for (let z = -36; z <= 40; z += 12.6) {
    for (const s of [-1, 1]) {
      const x = s * (STREET_HALF_W + 2.2);
      if (deco % 2 === 0) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 2.6, 8), trunkMat);
        trunk.position.set(x, 1.3, z);
        trunk.castShadow = true;
        scene.add(trunk);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), leafMat);
        crown.position.set(x, 3.6, z);
        crown.castShadow = true;
        scene.add(crown);
      } else {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.8, 6), lampMat);
        pole.position.set(x, 1.9, z);
        scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), bulbMat);
        bulb.position.set(x, 4, z);
        scene.add(bulb);
      }
      deco++;
    }
  }

  return {
    colliders,
    groundHeight,
    carpetStart: new THREE.Vector3(0, 0.2, CARPET_FROM_Z + 2.5),
    carpetEnd: new THREE.Vector3(0, 0.2, CARPET_TO_Z - 2),
    slotPos: (baseId, slotIndex) => slotCache[baseId][Math.min(Math.max(slotIndex, 0), 29)],
    lockPadPos: (baseId) => {
      const c = baseCenter(baseId);
      const side = baseSide(baseId);
      return new THREE.Vector3(side * (PLOT_INNER_X + 1.8), 0.3, c.z + (baseId % 2 === 0 ? 1 : -1) * 3);
    },
    doorCenter: (baseId) => {
      const c = baseCenter(baseId);
      const side = baseSide(baseId);
      return new THREE.Vector3(side * (PLOT_INNER_X + 0.6), 0, c.z);
    },
    setFloors: (baseId, floors) => {
      unlocked.set(baseId, floors);
      const tg = tierGroups.get(baseId)!;
      tg.t2.visible = floors >= 2;
      tg.t3.visible = floors >= 3;
    },
    setBaseLocked: (baseId, locked) => {
      const mats = glassMats.get(baseId);
      if (!mats) return;
      for (const m of mats) {
        m.color.setHex(locked ? GLASS_LOCKED : GLASS_OPEN);
        m.opacity = locked ? 0.75 : 0.45;
      }
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
    const ox = pos.x - px;
    const oz = pos.z - pz;
    const d = Math.hypot(ox, oz);
    if (d < radius && d > 0.0001) {
      const push = (radius - d) / d;
      pos.x += ox * push;
      pos.z += oz * push;
    }
  }
  pos.x = Math.max(-FIELD_X + 1, Math.min(FIELD_X - 1, pos.x));
  pos.z = Math.max(FIELD_Z_MIN + 1, Math.min(FIELD_Z_MAX - 1, pos.z));
}
