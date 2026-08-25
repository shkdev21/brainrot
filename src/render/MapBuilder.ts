import * as THREE from 'three';
import {
  FIELD_X, FIELD_Z_MIN, FIELD_Z_MAX, STREET_HALF_W, CARPET_HALF_W,
  CARPET_FROM_Z, CARPET_TO_Z, PLOT_INNER_X, PLOT_OUTER_X, PLOT_HALF_Z,
  HOUSE_X, HOUSE_HALF_X, HOUSE_HALF_Z, FLOOR_H, BASE_COUNT,
  baseSide, baseCenter, baseDoor,
} from '../core/Layout';

// 맵 빌더 — 원작 스타일: 중앙 레드카펫 거리 + 양옆 컬러 풀하우스 플롯.

export interface Seg {
  x1: number; z1: number; x2: number; z2: number;
}

export interface MapRefs {
  colliders: Seg[];
  groundHeight: (x: number, z: number) => number;
  /** 카펫 시작/끝 (브레인롯이 걸어감) */
  carpetStart: THREE.Vector3;
  carpetEnd: THREE.Vector3;
  slotPos: (baseId: number, slotIndex: number) => THREE.Vector3;
  lockPadPos: (baseId: number) => THREE.Vector3;
  doorCenter: (baseId: number) => THREE.Vector3;
  setFloors: (baseId: number, floors: 1 | 2 | 3) => void;
  setBaseLocked: (baseId: number, locked: boolean) => void;
}

const BASE_COLORS = [
  0xff7b54, 0x4ecdc4, 0xffd93d, 0x6c5ce7,
  0xff9ff3, 0x2e86de, 0xf9ca24, 0x26de81,
];
const SLOT_PER_FLOOR = 10;

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildMap(scene: THREE.Scene): MapRefs {
  const colliders: Seg[] = [];
  const unlocked = new Map<number, 1 | 2 | 3>();
  const doorMeshes: THREE.Mesh[] = [];
  const upperGroups = new Map<number, THREE.Group>();
  const terraceGroups = new Map<number, THREE.Group[]>();

  // ── 지면: 밝은 라임 잔디 ─────────────────────────────────
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_X * 2, 1, FIELD_Z_MAX - FIELD_Z_MIN),
    lambert(0x7ec850),
  );
  grass.position.set(0, -0.5, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  grass.receiveShadow = true;
  scene.add(grass);

  // ── 거리: 아스팔트 + 중앙선 + 보도 ────────────────────────
  const street = new THREE.Mesh(
    new THREE.BoxGeometry(STREET_HALF_W * 2 + 4, 0.3, FIELD_Z_MAX - FIELD_Z_MIN - 4),
    lambert(0x8a8f98),
  );
  street.position.set(0, 0.05, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  street.receiveShadow = true;
  scene.add(street);
  for (const s of [-1, 1]) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 2), lambert(0xf5f6fa));
    dash.position.set(0, 0.22, 0);
    scene.add(dash);
    void s;
  }
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

  // ── 레드카펫 (중앙 관통, 황금 테두리+스탠션) ───────────────
  const carpet = new THREE.Mesh(
    new THREE.BoxGeometry(CARPET_HALF_W * 2, 0.36, CARPET_TO_Z - CARPET_FROM_Z + 6),
    lambert(0xe03131),
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

  // ── 북쪽 스폰 구조물: 갈색 벽 + 어두운 출입구 + 표지 ───────
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

  // ── 8개 하우스 플롯 ──────────────────────────────────────
  for (let i = 0; i < BASE_COUNT; i++) {
    const side = baseSide(i);
    const c = baseCenter(i);
    const plotGroup = new THREE.Group();
    plotGroup.name = 'plot';
    plotGroup.position.set(c.x, 0, c.z);
    scene.add(plotGroup);

    // 플롯 잔디(경계석 느낌의 밝은 판)
    const plot = new THREE.Mesh(
      new THREE.BoxGeometry(PLOT_OUTER_X - PLOT_INNER_X, 0.22, PLOT_HALF_Z * 2),
      lambert(0x93d96a),
    );
    // 로컬 좌표: 플롯 중심은 |x| (13+35)/2 = 24 → side*24 - c.x
    plot.position.set(side * 24 - c.x, 0.11, 0);
    plot.receiveShadow = true;
    plotGroup.add(plot);

    // ── 하우스 ────────────────────────────────────────────
    const house = new THREE.Group();
    house.name = 'house';
    house.position.set(side * HOUSE_X - c.x, 0, 0);
    plotGroup.add(house);

    const color = BASE_COLORS[i];
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_HALF_X * 2, 3.2, HOUSE_HALF_Z * 2),
      lambert(color),
    );
    body.position.y = 1.6;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);

    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, HOUSE_HALF_X * 1.6, 2.6, 4),
      lambert(0xb0413e),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.5;
    roof.scale.set(1, 1, HOUSE_HALF_Z / HOUSE_HALF_X);
    roof.castShadow = true;
    house.add(roof);

    // 상층(2층 비주얼 — 3층은 별도 탑)
    const upper = new THREE.Group();
    upper.name = 'upper';
    upper.visible = false;
    const upperBody = new THREE.Mesh(
      new THREE.BoxGeometry(HOUSE_HALF_X * 2 - 1.2, 2.8, HOUSE_HALF_Z * 2 - 1.2),
      lambert(color),
    );
    upperBody.position.y = 3.2 + 1.4;
    upperBody.castShadow = true;
    upper.add(upperBody);
    const upperRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, HOUSE_HALF_X * 1.3, 2, 4),
      lambert(0xb0413e),
    );
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.position.y = 3.2 + 2.8 + 1;
    upperRoof.scale.set(1, 1, (HOUSE_HALF_Z - 0.6) / HOUSE_HALF_X);
    upper.add(upperRoof);
    house.add(upper);
    upperGroups.set(i, upper);

    // 문(거리 방향) — 잠금 색상 표시
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 1.7), lambert(0x2ecc71));
    door.position.set(-side * (HOUSE_HALF_X + 0.05), 1.3, 0);
    house.add(door);
    doorMeshes[i] = door;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), lambert(0xf1c40f));
    knob.position.set(-side * (HOUSE_HALF_X + 0.3), 1.3, 0.5);
    house.add(knob);

    // 창문
    const winMat = lambert(0xaed6f1);
    for (const wz of [-3.2, 3.2]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 2), winMat);
      win.position.set(-side * (HOUSE_HALF_X + 0.02), 2, wz);
      house.add(win);
    }

    // 집 충돌 AABB
    const hx = side * HOUSE_X;
    colliders.push(
      { x1: hx - HOUSE_HALF_X, z1: c.z - HOUSE_HALF_Z, x2: hx + HOUSE_HALF_X, z2: c.z - HOUSE_HALF_Z },
      { x1: hx - HOUSE_HALF_X, z1: c.z + HOUSE_HALF_Z, x2: hx + HOUSE_HALF_X, z2: c.z + HOUSE_HALF_Z },
      { x1: hx - HOUSE_HALF_X, z1: c.z - HOUSE_HALF_Z, x2: hx - HOUSE_HALF_X, z2: c.z + HOUSE_HALF_Z },
      { x1: hx + HOUSE_HALF_X, z1: c.z - HOUSE_HALF_Z, x2: hx + HOUSE_HALF_X, z2: c.z + HOUSE_HALF_Z },
    );

    // ── 테라스(2/3층 슬롯 단) ────────────────────────────────
    const terraces: THREE.Group[] = [];
    for (const f of [2, 3] as const) {
      const tg = new THREE.Group();
      tg.name = 'terrace';
      tg.visible = false;
      const depth = 5.4;
      const tx = side * (16 + (f - 1) * 5.4 + depth / 2);
      const plat = new THREE.Mesh(
        new THREE.BoxGeometry(depth, FLOOR_H, PLOT_HALF_Z * 2 - 2),
        lambert(0xc9a06a),
      );
      plat.position.set(tx - c.x, FLOOR_H * (f - 1) + FLOOR_H / 2, 0);
      plat.castShadow = true;
      plat.receiveShadow = true;
      tg.add(plat);
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, (FLOOR_H * (f - 1)) / steps, 2.4),
          lambert(0xb8925c),
        );
        step.position.set(
          tx - side * (depth / 2 + (steps - s) * 0.95) - c.x,
          ((FLOOR_H * (f - 1)) / steps) * (s + 0.5),
          PLOT_HALF_Z - 2.6,
        );
        tg.add(step);
      }
      plotGroup.add(tg);
      terraces.push(tg);
    }
    terraceGroups.set(i, terraces);
    unlocked.set(i, 1);

    // 잠금 패드
    const d = baseDoor(i);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.22, 14),
      lambert(0x7f8c9b),
    );
    pad.position.set(d.x - side * 1.6 - c.x, 0.24, 0);
    plotGroup.add(pad);
    const padIcon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), lambert(0x2d3436));
    padIcon.position.set(d.x - side * 1.6 - c.x, 0.6, 0);
    plotGroup.add(padIcon);
  }

  // ── 슬롯 위치: 층×5열×2줄 ─────────────────────────────────
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
      const x = side * (15.2 + floor * 5.4 + rowD * 2.5);
      const z = c.z + (col - 2) * 3.5;
      slots.push(new THREE.Vector3(x, floor * FLOOR_H + 0.5, z));
    }
    slotCache[i] = slots;
  }

  // ── 지면 높이: 테라스 반영 ────────────────────────────────
  const groundHeight = (x: number, z: number): number => {
    for (let i = 0; i < BASE_COUNT; i++) {
      const c = baseCenter(i);
      if (Math.abs(z - c.z) > PLOT_HALF_Z) continue;
      const side = baseSide(i);
      const ax = Math.abs(x);
      if (ax < 14 || ax > PLOT_OUTER_X) continue;
      if (Math.sign(x) !== side) continue;
      const floors = unlocked.get(i) ?? 1;
      const band1 = 20.6;
      const band2 = 26;
      let floor = 1;
      if (floors >= 2 && ax > band1) floor = 2;
      if (floors >= 3 && ax > band2) floor = 3;
      return (floor - 1) * FLOOR_H;
    }
    return 0;
  };

  // ── 필드 경계 울타리 + 충돌 ────────────────────────────────
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
  // 스폰 벽
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
      const d = baseDoor(baseId);
      const side = baseSide(baseId);
      return new THREE.Vector3(d.x - side * 1.6, 0.2, d.z);
    },
    doorCenter: (baseId) => {
      const d = baseDoor(baseId);
      return new THREE.Vector3(d.x, 0, d.z);
    },
    setFloors: (baseId, floors) => {
      unlocked.set(baseId, floors);
      upperGroups.get(baseId)!.visible = floors >= 2;
      const terr = terraceGroups.get(baseId)!;
      terr[0].visible = floors >= 2;
      terr[1].visible = floors >= 3;
    },
    setBaseLocked: (baseId, locked) => {
      const door = doorMeshes[baseId];
      if (door) {
        (door.material as THREE.MeshLambertMaterial).color.setHex(locked ? 0xe03131 : 0x2ecc71);
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
