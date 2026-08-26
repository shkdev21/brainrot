import * as THREE from 'three';
import { floorMaterial } from './StudTexture';
import {
  FIELD_X, FIELD_Z_MIN, FIELD_Z_MAX, STREET_HALF_W, CARPET_HALF_W,
  CARPET_FROM_Z, CARPET_TO_Z, PLOT_INNER_X, PLOT_OUTER_X, PLOT_HALF_Z,
  BASE_COUNT, baseSide, baseCenter,
} from '../core/Layout';

// 맵 빌더 — 원작 재현: 후방 본체 타워(층별 상자) + 전면 1층 전시장(좌우 5패드).
// 패드: 잔디색 사각, 캐릭터가 패드당 앞/뒤 2슬롯씩 전시 (층당 10슬롯).

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
  setBaseSkin: (baseId: number, skin: BaseSkin) => void;
  setBaseInfo: (baseId: number, count: number, slots: number) => void;
  rainbowMats: THREE.MeshLambertMaterial[];
}

export type BaseSkin = 'default' | 'gold' | 'diamond' | 'rainbow';

interface SkinTargets {
  frameMats: THREE.MeshLambertMaterial[];
  trimMats: THREE.MeshLambertMaterial[];
  padMats: THREE.MeshLambertMaterial[];
  barMat: THREE.MeshLambertMaterial | null;
  matMeshes: THREE.Mesh[];
}

const SKIN_PALETTE: Record<BaseSkin, { frame: number; trim: number; pad: number; bar: number; mat: [string, string] }> = {
  default: { frame: 0x1e3a5f, trim: 0xffffff, pad: 0x58c860, bar: 0, mat: ['#d8c8a8', '#e6d7b8'] },
  gold:    { frame: 0xB8860B, trim: 0xFFF3B0, pad: 0xE8B923, bar: 0xE8B923, mat: ['#e8d070', '#f5e6a8'] },
  diamond: { frame: 0x2f9ec4, trim: 0xffffff, pad: 0x4FC3F7, bar: 0x4FC3F7, mat: ['#bfe8f5', '#dff4fb'] },
  rainbow: { frame: 0x57606f, trim: 0xffffff, pad: 0x58c860, bar: 0xff0000, mat: ['#d8c8a8', '#e6d7b8'] },
};

const MAT_BEIGE = '#d8c8a8';
const GLASS_OPEN = 0x9fd8ff;
const GLASS_LOCKED = 0xff5252;
const FLOOR_H = 4.0;
const WALL_T = 0.6;

/** x 대역 (전면→후방): 전시장 | 계단1 | 2층 발코니 | 계단2 | 3층 본체 */
const SHOW_X0 = PLOT_INNER_X;        // 13 전면
const SHOW_X1 = PLOT_INNER_X + 8.5;  // 21.5 전시장 끝
const LV2_X0 = SHOW_X1 + 2;          // 23.5 2층 시작
const LV2_X1 = LV2_X0 + 4;           // 27.5 2층 끝
const LV3_X0 = LV2_X1 + 2;           // 29.5 3층 시작

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildMap(scene: THREE.Scene, ownerNames?: string[]): MapRefs {
  const colliders: Seg[] = [];
  const unlocked = new Map<number, 1 | 2 | 3>();
  const skinOf = new Map<number, BaseSkin>();
  const glassMats = new Map<number, THREE.MeshLambertMaterial[]>();
  const skinTargets = new Map<number, SkinTargets>();
  const lockBarGroups = new Map<number, THREE.Group>();
  const balconyGroups = new Map<number, { b2: THREE.Group; b3: THREE.Group }>();
  const nameSignCanvases = new Map<number, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; name: string }>();
  const rebuildables = new Map<number, Array<() => void>>();
  const matMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
  const rainbowMats: THREE.MeshLambertMaterial[] = [];

  // ── 지면/거리/카펫/스폰 ───────────────────────────────────
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_X * 2, 1, FIELD_Z_MAX - FIELD_Z_MIN),
    floorMaterial('#5fca64', FIELD_X * 2, FIELD_Z_MAX - FIELD_Z_MIN),
  );
  grass.position.set(0, -0.5, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  grass.receiveShadow = true;
  scene.add(grass);

  const street = new THREE.Mesh(
    new THREE.BoxGeometry(STREET_HALF_W * 2 + 4, 0.3, FIELD_Z_MAX - FIELD_Z_MIN - 4),
    floorMaterial('#8a8f98', STREET_HALF_W * 2 + 4, FIELD_Z_MAX - FIELD_Z_MIN - 4, { lineDark: 0.12 }),
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

  const carpet = new THREE.Mesh(
    new THREE.BoxGeometry(CARPET_HALF_W * 2, 0.36, CARPET_TO_Z - CARPET_FROM_Z + 6),
    floorMaterial('#eb544c', CARPET_HALF_W * 2, CARPET_TO_Z - CARPET_FROM_Z + 6, { linePx: 2, lineDark: 0.08 }),
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

  // ── 8개 기지: 후방 타워 + 전면 전시장 ────────────────────
  for (let i = 0; i < BASE_COUNT; i++) {
    const side = baseSide(i);
    const c = baseCenter(i);
    const root = new THREE.Group();
    scene.add(root);
    const S = (x: number) => side * x;
    const skins: SkinTargets = { frameMats: [], trimMats: [], padMats: [], barMat: null, matMeshes: [] };
    skinTargets.set(i, skins);
    skinOf.set(i, 'default');
    rebuildables.set(i, []);
    const pal = () => SKIN_PALETTE[skinOf.get(i) ?? 'default'];

    // ── 1층 전시장 바닥 ─────────────────────────────────────
    const showFloor = new THREE.Mesh(
      new THREE.BoxGeometry(SHOW_X1 - SHOW_X0 + 4.5, 0.5, PLOT_HALF_Z * 2 - WALL_T),
      floorMaterial(MAT_BEIGE, SHOW_X1 - SHOW_X0 + 4.5, PLOT_HALF_Z * 2 - WALL_T, { lineDark: 0.12 }),
    );
    showFloor.position.set(S((SHOW_X0 + SHOW_X1 + 2) / 2 - 1), 0.25, c.z);
    showFloor.receiveShadow = true;
    root.add(showFloor);
    skins.matMeshes.push(showFloor);

    // ── 좌우 5개 진열 패드 (전시장, 잔디색 사각+흰 테두리) ──
    for (let k = 0; k < 5; k++) {
      const z = c.z + (k - 2) * 3.7;
      const padMesh = new THREE.Mesh(
        new THREE.BoxGeometry(6.8, 0.16, 3.0),
        lambert(pal().pad),
      );
      padMesh.position.set(S(SHOW_X0 + 4.3), 0.55, z);
      padMesh.receiveShadow = true;
      root.add(padMesh);
      skins.padMats.push(padMesh.material as THREE.MeshLambertMaterial);
      for (const [ox, oz, w2, d2] of [
        [0, -1.55, 7.0, 0.2], [0, 1.55, 7.0, 0.2], [-3.5, 0, 0.2, 3.3], [3.5, 0, 0.2, 3.3],
      ] as const) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.1, d2), lambert(0xffffff));
        t.position.set(S(SHOW_X0 + 4.3 + ox), 0.62, z + oz);
        root.add(t);
        skins.trimMats.push(t.material as THREE.MeshLambertMaterial);
      }
    }

    // ── 후방 본체 타워 (층별 상자, 해금 시 증축) ────────────
    const rebuildTower = () => {
      for (const ch of [...root.children]) {
        if (ch.name === 'tower') root.remove(ch);
      }
      skins.frameMats = skins.frameMats.filter(() => false);
      const tower = new THREE.Group();
      tower.name = 'tower';
      const floors = unlocked.get(i) ?? 1;
      for (let f = 0; f < floors; f++) {
        const y0 = f * FLOOR_H;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - LV2_X0, FLOOR_H, PLOT_HALF_Z * 2),
          lambert(pal().frame),
        );
        box.position.set(S((LV2_X0 + PLOT_OUTER_X) / 2), y0 + FLOOR_H / 2, c.z);
        box.castShadow = true;
        box.receiveShadow = true;
        tower.add(box);
        skins.frameMats.push(box.material as THREE.MeshLambertMaterial);
        // 전면 창문 (흰 세로 스트립)
        for (const wz of [-6, -2, 2, 6]) {
          const win = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, FLOOR_H * 0.55, 1.6),
            lambert(0xdfe9f5),
          );
          win.position.set(S(LV2_X0 - 0.15), y0 + FLOOR_H * 0.55, c.z + wz);
          tower.add(win);
          skins.trimMats.push(win.material as THREE.MeshLambertMaterial);
        }
        // 층 상단 노란 트림
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - LV2_X0 + 0.3, 0.5, PLOT_HALF_Z * 2 + 0.3),
          lambert(0xf6c443),
        );
        strip.position.set(S((LV2_X0 + PLOT_OUTER_X) / 2), y0 + FLOOR_H - 0.25, c.z);
        tower.add(strip);
      }
      // 최상단 이름 간판
      const name = ownerNames?.[i] ?? `기지 ${i + 1}`;
      let info = nameSignCanvases.get(i);
      if (!info) {
        const nc = document.createElement('canvas');
        nc.width = 256; nc.height = 96;
        const nctx = nc.getContext('2d')!;
        nctx.fillStyle = '#1e3a5f'; nctx.fillRect(0, 0, 256, 96);
        nctx.fillStyle = '#ffd43b'; nctx.fillRect(0, 0, 256, 14);
        nctx.font = 'bold 38px sans-serif'; nctx.fillStyle = '#fff';
        nctx.textAlign = 'center'; nctx.textBaseline = 'middle';
        nctx.fillText(name, 128, 42);
        nctx.font = 'bold 30px sans-serif'; nctx.fillStyle = '#ffd43b';
        nctx.fillText('🧠 0/10', 128, 76);
        info = { canvas: nc, tex: new THREE.CanvasTexture(nc), name };
        nameSignCanvases.set(i, info);
      }
      const nameSign = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 3.2),
        new THREE.MeshBasicMaterial({ map: info.tex }),
      );
      nameSign.position.set(S((LV2_X0 + PLOT_OUTER_X) / 2), floors * FLOOR_H + 1.9, c.z);
      nameSign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      tower.add(nameSign);
      // 최상단 기지색 캡
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(PLOT_OUTER_X - LV2_X0 + 0.4, 0.6, PLOT_HALF_Z * 2 + 0.4),
        lambert([0xff7b54, 0x4ecdc4, 0xffd93d, 0x6c5ce7, 0xff9ff3, 0x2e86de, 0xf9ca24, 0x26de81][i]),
      );
      cap.position.set(S((LV2_X0 + PLOT_OUTER_X) / 2), floors * FLOOR_H + 0.3, c.z);
      tower.add(cap);
      skins.barMat = cap.material as THREE.MeshLambertMaterial;
      root.add(tower);
    };
    rebuildTower();
    rebuildables.get(i)!.push(rebuildTower);

    // ── 2/3층 발코니 (전면 진열 플랫폼 + 패드 5개) ──────────
    const mkBalcony = (floorIdx: 1 | 2, x0: number, x1: number) => {
      const g = new THREE.Group();
      g.visible = false;
      const plat = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, 0.5, PLOT_HALF_Z * 2 - WALL_T),
        floorMaterial(MAT_BEIGE, x1 - x0, PLOT_HALF_Z * 2 - WALL_T, { lineDark: 0.12 }),
      );
      plat.position.set(S((x0 + x1) / 2), floorIdx * FLOOR_H - 0.25, c.z);
      plat.castShadow = true;
      plat.receiveShadow = true;
      g.add(plat);
      skins.matMeshes.push(plat);
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.9, PLOT_HALF_Z * 2 - WALL_T),
        lambert(0xf6c443),
      );
      rail.position.set(S(x0 + 0.15), floorIdx * FLOOR_H + 0.45, c.z);
      g.add(rail);
      for (let k = 0; k < 5; k++) {
        const z = c.z + (k - 2) * 3.7;
        const padMesh = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0 - 1.6, 0.16, 3.0),
          lambert(pal().pad),
        );
        padMesh.position.set(S((x0 + x1) / 2), floorIdx * FLOOR_H + 0.08, z);
        padMesh.receiveShadow = true;
        g.add(padMesh);
        skins.padMats.push(padMesh.material as THREE.MeshLambertMaterial);
      }
      root.add(g);
      return g;
    };
    const balcony2 = mkBalcony(1, LV2_X0, LV2_X1);
    const balcony3 = mkBalcony(2, LV3_X0, PLOT_OUTER_X - 0.5);
    balconyGroups.set(i, { b2: balcony2, b3: balcony3 });

    // ── 계단 (층간, z 가장자리) ──────────────────────────────
    const stairZ = c.z + (PLOT_HALF_Z - 2.4);
    const mkStairs = (xEdge: number, yFrom: number, yTo: number) => {
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, (yTo - yFrom) / steps * (s + 1), 2.4),
          lambert(0x9aa0aa),
        );
        step.position.set(
          S(xEdge - 0.5 - s * 1.0),
          yFrom + (yTo - yFrom) / steps * (s + 1) / 2,
          stairZ,
        );
        root.add(step);
      }
    };
    mkStairs(SHOW_X1 + 2, 0, FLOOR_H);
    mkStairs(LV2_X1 + 2, FLOOR_H, FLOOR_H * 2);

    // ── 양측벽 (전면 개방) ───────────────────────────────────
    for (const sz of [-1, 1]) {
      const zEdge = c.z + sz * (PLOT_HALF_Z - WALL_T / 2);
      colliders.push(
        { x1: S(PLOT_INNER_X + 0.3), z1: zEdge, x2: S(PLOT_OUTER_X - WALL_T), z2: zEdge },
      );
      const rebuildSide = () => {
        for (const ch of [...root.children]) {
          if (ch.name === `side${sz}`) root.remove(ch);
        }
        const g = new THREE.Group();
        g.name = `side${sz}`;
        const floors = unlocked.get(i) ?? 1;
        const h = floors * FLOOR_H + 1.4;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - PLOT_INNER_X - WALL_T, h, WALL_T),
          lambert(pal().frame),
        );
        wall.position.set(S((PLOT_INNER_X + PLOT_OUTER_X) / 2), h / 2, zEdge);
        wall.castShadow = true;
        wall.receiveShadow = true;
        g.add(wall);
        const capW = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - PLOT_INNER_X - WALL_T + 0.2, 0.18, WALL_T + 0.2),
          lambert(0xffffff),
        );
        capW.position.set(S((PLOT_INNER_X + PLOT_OUTER_X) / 2), h + 0.1, zEdge);
        g.add(capW);
        root.add(g);
      };
      rebuildSide();
      rebuildables.get(i)!.push(rebuildSide);
    }
    // 후벽 콜라이더
    colliders.push(
      { x1: S(PLOT_OUTER_X - WALL_T), z1: c.z - PLOT_HALF_Z, x2: S(PLOT_OUTER_X - WALL_T), z2: c.z + PLOT_HALF_Z },
    );

    // ── 미해금 층 차단벽 ─────────────────────────────────────
    const rebuildBlockers = () => {
      for (const ch of [...root.children]) {
        if (ch.name === 'blocker') root.remove(ch);
      }
      // 기존 차단 collider 제거
      for (let ci = colliders.length - 1; ci >= 0; ci--) {
        if (colliders[ci].x1 === S(SHOW_X1 + 2.2) && colliders[ci].z1 === c.z - PLOT_HALF_Z) {
          colliders.splice(ci, 1);
        }
        if (colliders[ci].x1 === S(LV2_X1 + 2.2) && colliders[ci].z1 === c.z - PLOT_HALF_Z) {
          colliders.splice(ci, 1);
        }
      }
      const floors = unlocked.get(i) ?? 1;
      if (floors < 2) {
        const bx = S(SHOW_X1 + 2.2);
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(WALL_T, FLOOR_H * 3, PLOT_HALF_Z * 2 - WALL_T),
          lambert(pal().frame),
        );
        b.name = 'blocker';
        b.position.set(bx, FLOOR_H * 1.5, c.z);
        root.add(b);
        colliders.push({ x1: bx, z1: c.z - PLOT_HALF_Z, x2: bx, z2: c.z + PLOT_HALF_Z });
      } else if (floors < 3) {
        const bx = S(LV2_X1 + 2.2);
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(WALL_T, FLOOR_H * 2, PLOT_HALF_Z * 2 - WALL_T),
          lambert(pal().frame),
        );
        b.name = 'blocker';
        b.position.set(bx, FLOOR_H * 2, c.z);
        root.add(b);
        colliders.push({ x1: bx, z1: c.z - PLOT_HALF_Z, x2: bx, z2: c.z + PLOT_HALF_Z });
      }
    };
    rebuildBlockers();
    rebuildables.get(i)!.push(rebuildBlockers);

    // ── 전면 유리 + 철창 + 잠금 패드 ────────────────────────
    const glasses: THREE.MeshLambertMaterial[] = [];
    const glassMat = new THREE.MeshLambertMaterial({
      color: GLASS_OPEN, transparent: true, opacity: 0.45,
    });
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.2, PLOT_HALF_Z * 2 - 1),
      glassMat,
    );
    panel.position.set(S(PLOT_INNER_X + 0.3), 0.85, c.z);
    root.add(panel);
    glasses.push(glassMat);
    glassMats.set(i, glasses);

    const frontTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, PLOT_HALF_Z * 2),
      lambert(0xffffff),
    );
    frontTrim.position.set(S(PLOT_INNER_X + 0.3), 0.42, c.z);
    root.add(frontTrim);
    skins.trimMats.push(frontTrim.material as THREE.MeshLambertMaterial);

    const bars = new THREE.Group();
    bars.visible = false;
    root.add(bars);
    lockBarGroups.set(i, bars);
    const rebuildBars = (floorsN: number) => {
      bars.clear();
      const barMat2 = lambert(0xd63031);
      const barTopMat2 = lambert(0xa61e1e);
      const h = floorsN * FLOOR_H + 1.4;
      for (let bz = -PLOT_HALF_Z + 1; bz <= PLOT_HALF_Z - 1; bz += 1.3) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, h, 8), barMat2);
        bar.position.set(S(PLOT_INNER_X + 0.4), h / 2, c.z + bz);
        bars.add(bar);
      }
      for (const [by, bh] of [[h + 0.2, 0.45], [h * 0.55, 0.3]] as const) {
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, bh, PLOT_HALF_Z * 2 - 0.6),
          barTopMat2,
        );
        beam.position.set(S(PLOT_INNER_X + 0.4), by, c.z);
        bars.add(beam);
      }
    };
    rebuildBars(1);
    rebuildables.get(i)!.push(() => rebuildBars(unlocked.get(i) ?? 1));

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.26, 14),
      lambert(0x7f8c9b),
    );
    pad.position.set(S(PLOT_INNER_X + 1.8), 0.55, c.z + (i % 2 === 0 ? 1 : -1) * 3);
    root.add(pad);

    unlocked.set(i, 1);
  }

  // ── 슬롯: 층×패드5×앞뒤2 ─────────────────────────────────
  const slotCache: THREE.Vector3[][] = [];
  for (let i = 0; i < BASE_COUNT; i++) {
    const c = baseCenter(i);
    const S = (x: number) => baseSide(i) * x;
    const slots: THREE.Vector3[] = [];
    const floorX: [number, number][] = [
      [PLOT_INNER_X + 2.6, PLOT_INNER_X + 6.0],
      [LV2_X0 + 1.3, LV2_X1 - 1.3],
      [LV3_X0 + 1.3, PLOT_OUTER_X - 1.8],
    ];
    for (let f = 0; f < 3; f++) {
      for (let k = 0; k < 5; k++) {
        const z = c.z + (k - 2) * 3.7;
        for (const x of floorX[f]) {
          slots.push(new THREE.Vector3(S(x), f * FLOOR_H + 0.5, z));
        }
      }
    }
    slotCache[i] = slots;
  }

  // ── 지면 높이 ─────────────────────────────────────────────
  const groundHeight = (x: number, z: number): number => {
    for (let i = 0; i < BASE_COUNT; i++) {
      const c = baseCenter(i);
      if (Math.abs(z - c.z) > PLOT_HALF_Z) continue;
      const side = baseSide(i);
      const ax = Math.abs(x);
      if (ax < PLOT_INNER_X - 1 || ax > PLOT_OUTER_X) continue;
      if (Math.sign(x) !== side) continue;
      const floors = unlocked.get(i) ?? 1;
      const lerp = (edge: number, lower: number, upper: number) => {
        if (ax < edge - 1) return lower;
        if (ax > edge + 1) return upper;
        const t = (ax - (edge - 1)) / 2;
        return lower + (upper - lower) * t;
      };
      if (floors >= 2) {
        if (ax > LV2_X0 - 1 && ax <= LV2_X1 + 1) {
          return floors >= 3 && ax > LV2_X1 ? lerp(LV2_X1 + 1.5, FLOOR_H, FLOOR_H * 2) : FLOOR_H;
        }
        if (ax > SHOW_X1 - 1 && ax <= LV2_X0) return lerp(SHOW_X1 + 1, 0, FLOOR_H);
      }
      if (floors >= 3 && ax > LV3_X0 - 1) return FLOOR_H * 2;
      return 0;
    }
    return 0;
  };

  // ── 필드 경계 ─────────────────────────────────────────────
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
      const bg = balconyGroups.get(baseId)!;
      bg.b2.visible = floors >= 2;
      bg.b3.visible = floors >= 3;
      for (const rebuild of rebuildables.get(baseId) ?? []) rebuild();
    },
    setBaseLocked: (baseId, locked) => {
      const bars = lockBarGroups.get(baseId);
      if (bars) bars.visible = locked;
      const mats = glassMats.get(baseId);
      if (!mats) return;
      for (const m of mats) {
        m.color.setHex(locked ? GLASS_LOCKED : GLASS_OPEN);
        m.opacity = locked ? 0.35 : 0.45;
      }
    },
    setBaseInfo: (baseId, count, slotsN) => {
      const info = nameSignCanvases.get(baseId);
      if (!info) return;
      const ctx = info.canvas.getContext('2d')!;
      ctx.fillStyle = '#1e3a5f'; ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = '#ffd43b'; ctx.fillRect(0, 0, 256, 14);
      ctx.font = 'bold 38px sans-serif'; ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(info.name, 128, 42);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#ffd43b';
      ctx.fillText(`🧠 ${count}/${slotsN}`, 128, 76);
      info.tex.needsUpdate = true;
    },
    setBaseSkin: (baseId, skin) => {
      skinOf.set(baseId, skin);
      const targets = skinTargets.get(baseId);
      if (!targets) return;
      const p = SKIN_PALETTE[skin];
      for (const m of targets.frameMats) m.color.setHex(p.frame);
      for (const m of targets.trimMats) m.color.setHex(p.trim);
      for (const m of targets.padMats) m.color.setHex(p.pad);
      if (targets.barMat) {
        targets.barMat.color.setHex(p.bar);
        const idx = rainbowMats.indexOf(targets.barMat);
        if (skin === 'rainbow' && idx < 0) rainbowMats.push(targets.barMat);
        if (skin !== 'rainbow' && idx >= 0) rainbowMats.splice(idx, 1);
      }
      const key = skin;
      let mat = matMaterialCache.get(key);
      if (!mat) {
        mat = floorMaterial(p.mat[0], 10, 10, { lineDark: 0.12 });
        matMaterialCache.set(key, mat);
      }
      for (const mesh of targets.matMeshes) {
        mesh.material = mat;
      }
    },
    rainbowMats,
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
  pos.z = Math.max(-FIELD_Z_MIN + 1, Math.min(FIELD_Z_MAX - 1, pos.z));
}
