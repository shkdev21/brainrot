import * as THREE from 'three';
import { floorMaterial } from './StudTexture';
import {
  FIELD_X, FIELD_Z_MIN, FIELD_Z_MAX, STREET_HALF_W, CARPET_HALF_W,
  CARPET_FROM_Z, CARPET_TO_Z, PLOT_INNER_X, PLOT_OUTER_X, PLOT_HALF_Z,
  BASE_COUNT, baseSide, baseCenter,
} from '../core/Layout';

// 맵 빌더 — 원작 스타일 거리 + "박스형 전시 기지".
// 기지 = 앞면 개방(잠금 철창) + 3면 벽 + 등분 3티어 + 좌/우 진열 영역.

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
  barMat: THREE.MeshLambertMaterial | null;
  matMeshes: THREE.Mesh[];
}

const SKIN_PALETTE: Record<BaseSkin, { frame: number; trim: number; bar: number; mat: [string, string] }> = {
  default: { frame: 0x1e3a5f, trim: 0xffffff, bar: 0, mat: ['#d8c8a8', '#e6d7b8'] },
  gold:    { frame: 0xB8860B, trim: 0xFFF3B0, bar: 0xE8B923, mat: ['#e8d070', '#f5e6a8'] },
  diamond: { frame: 0x2f9ec4, trim: 0xffffff, bar: 0x4FC3F7, mat: ['#bfe8f5', '#dff4fb'] },
  rainbow: { frame: 0x57606f, trim: 0xffffff, bar: 0xff0000, mat: ['#d8c8a8', '#e6d7b8'] },
};

const NAVY = 0x1e3a5f;
const MAT_BEIGE = '#d8c8a8';
const PAD_BEIGE = 0xc9b694; // 진열 패드 (매트보다 어둡게)
const GLASS_OPEN = 0x9fd8ff;
const GLASS_LOCKED = 0xff5252;

/** 등분 티어 경계(|x| 기준): 13 | 20.33 | 27.67 | 35 */
const PLOT_DEPTH = PLOT_OUTER_X - PLOT_INNER_X; // 22
const THIRD = PLOT_DEPTH / 3;
const TIER1_X = PLOT_INNER_X + THIRD;
const TIER2_X = PLOT_INNER_X + THIRD * 2;
const TIER_H = 2.6;
const WALL_T = 0.6;

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildMap(scene: THREE.Scene, ownerNames?: string[]): MapRefs {
  const colliders: Seg[] = [];
  const unlocked = new Map<number, 1 | 2 | 3>();
  const skinOf = new Map<number, BaseSkin>();
  const glassMats = new Map<number, THREE.MeshLambertMaterial[]>();
  const tierGroups = new Map<number, { t2: THREE.Group; t3: THREE.Group }>();
  const skinTargets = new Map<number, SkinTargets>();
  const lockBarGroups = new Map<number, THREE.Group>();
  const nameSignCanvases = new Map<number, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; name: string }>();
  const rebuildables = new Map<number, Array<() => void>>(); // 층 의존 재구성 목록
  const matMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
  const rainbowMats: THREE.MeshLambertMaterial[] = [];

  // ── 지면: 밝은 잔디 (격자 타일) ───────────────────────────
  const grass = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_X * 2, 1, FIELD_Z_MAX - FIELD_Z_MIN),
    floorMaterial('#5fca64', FIELD_X * 2, FIELD_Z_MAX - FIELD_Z_MIN),
  );
  grass.position.set(0, -0.5, (FIELD_Z_MAX + FIELD_Z_MIN) / 2);
  grass.receiveShadow = true;
  scene.add(grass);

  // ── 거리: 아스팔트 + 보도 ─────────────────────────────────
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

  // ── 레드카펫 ──────────────────────────────────────────────
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

  // ── 8개 박스형 전시 기지 ──────────────────────────────────
  for (let i = 0; i < BASE_COUNT; i++) {
    const side = baseSide(i);
    const c = baseCenter(i);
    const root = new THREE.Group();
    scene.add(root);
    const S = (x: number) => side * x;
    const skins: SkinTargets = { frameMats: [], trimMats: [], barMat: null, matMeshes: [] };
    skinTargets.set(i, skins);
    skinOf.set(i, 'default');
    rebuildables.set(i, []);

    // ── 티어 슬랩 (등분 3단) ────────────────────────────────
    const slab1 = new THREE.Mesh(
      new THREE.BoxGeometry(THIRD + 1, 0.5, PLOT_HALF_Z * 2 - WALL_T),
      floorMaterial(MAT_BEIGE, THIRD + 1, PLOT_HALF_Z * 2 - WALL_T, { lineDark: 0.12 }),
    );
    slab1.position.set(S(PLOT_INNER_X + THIRD / 2 - 0.5), 0.25, c.z);
    slab1.receiveShadow = true;
    root.add(slab1);
    skins.matMeshes.push(slab1);

    const t2 = new THREE.Group();
    t2.visible = false;
    const slab2 = new THREE.Mesh(
      new THREE.BoxGeometry(THIRD, TIER_H + 0.5, PLOT_HALF_Z * 2 - WALL_T),
      floorMaterial(MAT_BEIGE, THIRD, PLOT_HALF_Z * 2 - WALL_T, { lineDark: 0.12 }),
    );
    slab2.position.set(S(TIER1_X + THIRD / 2), (TIER_H + 0.5) / 2, c.z);
    slab2.castShadow = true;
    slab2.receiveShadow = true;
    t2.add(slab2);
    root.add(t2);
    skins.matMeshes.push(slab2);

    const t3 = new THREE.Group();
    t3.visible = false;
    const slab3 = new THREE.Mesh(
      new THREE.BoxGeometry(THIRD, TIER_H * 2 + 0.5, PLOT_HALF_Z * 2 - WALL_T),
      floorMaterial(MAT_BEIGE, THIRD, PLOT_HALF_Z * 2 - WALL_T, { lineDark: 0.12 }),
    );
    slab3.position.set(S(TIER2_X + THIRD / 2), (TIER_H * 2 + 0.5) / 2, c.z);
    slab3.castShadow = true;
    slab3.receiveShadow = true;
    t3.add(slab3);
    root.add(t3);
    skins.matMeshes.push(slab3);
    tierGroups.set(i, { t2, t3 });

    // ── 후벽 (이름 간판 타워) ────────────────────────────────
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_T, 9.2, PLOT_HALF_Z * 2),
      lambert(NAVY),
    );
    backWall.position.set(S(PLOT_OUTER_X - WALL_T / 2), 4.6, c.z);
    backWall.castShadow = true;
    root.add(backWall);
    skins.frameMats.push(backWall.material as THREE.MeshLambertMaterial);
    colliders.push(
      { x1: S(PLOT_OUTER_X - WALL_T), z1: c.z - PLOT_HALF_Z, x2: S(PLOT_OUTER_X - WALL_T), z2: c.z + PLOT_HALF_Z },
    );

    const name = ownerNames?.[i] ?? `기지 ${i + 1}`;
    const nc = document.createElement('canvas');
    nc.width = 256; nc.height = 96;
    const nctx = nc.getContext('2d')!;
    nctx.fillStyle = '#1e3a5f'; nctx.fillRect(0, 0, 256, 96);
    nctx.fillStyle = '#ffd43b'; nctx.fillRect(0, 0, 256, 14);
    nctx.font = 'bold 44px sans-serif'; nctx.fillStyle = '#fff';
    nctx.textAlign = 'center'; nctx.textBaseline = 'middle';
    nctx.fillText(name, 128, 52);
    const nameTex = new THREE.CanvasTexture(nc);
    nameSignCanvases.set(i, { canvas: nc, tex: nameTex, name });
    const nameSign = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 2.8),
      new THREE.MeshBasicMaterial({ map: nameTex }),
    );
    nameSign.position.set(S(PLOT_OUTER_X - WALL_T - 0.05), 6.6, c.z);
    nameSign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(nameSign);
    const trimBar = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_T + 0.1, 0.7, PLOT_HALF_Z * 2),
      lambert([0xff7b54, 0x4ecdc4, 0xffd93d, 0x6c5ce7, 0xff9ff3, 0x2e86de, 0xf9ca24, 0x26de81][i]),
    );
    trimBar.position.set(S(PLOT_OUTER_X - WALL_T / 2), 9.3, c.z);
    root.add(trimBar);
    skins.barMat = trimBar.material as THREE.MeshLambertMaterial;

    // ── 양측벽 (전면 개방) — 층 해금에 따라 높이 증축 ───────
    for (const sz of [-1, 1]) {
      const zEdge = c.z + sz * (PLOT_HALF_Z - WALL_T / 2);
      // 충돌 — 항상 전체 폭
      colliders.push(
        { x1: S(PLOT_INNER_X + 0.3), z1: zEdge, x2: S(PLOT_OUTER_X - WALL_T), z2: zEdge },
      );
      const rebuild = () => {
        // 기존 벽 제거
        for (const ch of [...root.children]) {
          if (ch instanceof THREE.Mesh && Math.abs(ch.position.z - zEdge) < 0.05 && ch !== backWall) {
            root.remove(ch);
            const mi = skins.frameMats.indexOf(ch.material as THREE.MeshLambertMaterial);
            if (mi >= 0) skins.frameMats.splice(mi, 1);
          }
        }
        const floors = unlocked.get(i) ?? 1;
        const h = floors * TIER_H + 1.4;
        const pal = SKIN_PALETTE[skinOf.get(i) ?? 'default'];
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - PLOT_INNER_X - WALL_T, h, WALL_T),
          lambert(pal.frame),
        );
        wall.position.set(S((PLOT_INNER_X + PLOT_OUTER_X) / 2), h / 2, zEdge);
        wall.castShadow = true;
        wall.receiveShadow = true;
        root.add(wall);
        skins.frameMats.push(wall.material as THREE.MeshLambertMaterial);
        // 상단 흰 테두리
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(PLOT_OUTER_X - PLOT_INNER_X - WALL_T + 0.2, 0.18, WALL_T + 0.2),
          lambert(0xffffff),
        );
        cap.position.set(S((PLOT_INNER_X + PLOT_OUTER_X) / 2), h + 0.1, zEdge);
        root.add(cap);
        skins.trimMats.push(cap.material as THREE.MeshLambertMaterial);
      };
      rebuild();
      rebuildables.get(i)!.push(rebuild);
    }

    // ── 좌/우 진열 영역 패드 (층별 2개씩) ────────────────────
    const addZonePads = (
      group: THREE.Group, y: number, bandStart: number,
    ) => {
      for (const sz of [-1, 1]) {
        const zoneZ = c.z + sz * 3.6;
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(THIRD - 1.6, 0.14, 4.4),
          lambert(PAD_BEIGE),
        );
        pad.position.set(S(bandStart + THIRD / 2), y + 0.07, zoneZ);
        pad.receiveShadow = true;
        group.add(pad);
        // 흰 테두리 프레임
        const frameMat = lambert(0xffffff);
        const fx = THIRD - 1.4;
        const fz = 4.6;
        const mk = (w: number, d: number, ox: number, oz: number) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), frameMat);
          m.position.set(S(bandStart + THIRD / 2 + ox), y + 0.12, zoneZ + oz);
          group.add(m);
        };
        mk(fx, 0.22, 0, -fz / 2);
        mk(fx, 0.22, 0, fz / 2);
        mk(0.22, fz, -fx / 2, 0);
        mk(0.22, fz, fx / 2, 0);
        skins.trimMats.push(frameMat);
      }
    };
    addZonePads(root, 0.5, PLOT_INNER_X + 0.5);
    addZonePads(t2, TIER_H + 0.5, TIER1_X);
    addZonePads(t3, TIER_H * 2 + 0.5, TIER2_X);

    // ── 티어 계단 (기지 안쪽, z 중앙 통로) ──────────────────
    const stairZ = c.z;
    for (const [edgeX, topY] of [[TIER1_X, TIER_H], [TIER2_X, TIER_H * 2]] as const) {
      for (let s = 0; s < 5; s++) {
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(0.95, topY / 5 * (s + 1), 2.4),
          lambert(0x9aa0aa),
        );
        step.position.set(S(edgeX - 0.5 - s * 0.95), (topY / 5 * (s + 1)) / 2, stairZ);
        (edgeX === TIER1_X ? root : edgeX === TIER2_X ? t2 : t3).add(step);
      }
    }

    // ── 전면 유리 + 흰 테두리 ────────────────────────────────
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

    // ── 잠금 철창 — 잠기면 전면을 빨간 세로봉으로 봉쇄 ──────
    const bars = new THREE.Group();
    bars.visible = false;
    root.add(bars);
    lockBarGroups.set(i, bars);
    const rebuildBars = (floors: number) => {
      bars.clear();
      const barMat2 = lambert(0xd63031);
      const barTopMat2 = lambert(0xa61e1e);
      const SPACING = 1.3;
      const R = 0.11;
      const h = floors * TIER_H + 1.4;
      for (let bz = -PLOT_HALF_Z + 1; bz <= PLOT_HALF_Z - 1; bz += SPACING) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, 8), barMat2);
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

    // ── 잠금 패드 ────────────────────────────────────────────
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.26, 14),
      lambert(0x7f8c9b),
    );
    pad.position.set(S(PLOT_INNER_X + 1.8), 0.55, c.z + (i % 2 === 0 ? 1 : -1) * 3);
    root.add(pad);

    unlocked.set(i, 1);
  }

  // ── 슬롯: 층×좌/우 영역 (한 영역 5슬롯 = 앞 3 + 뒤 2) ──────
  const slotCache: THREE.Vector3[][] = [];
  for (let i = 0; i < BASE_COUNT; i++) {
    const c = baseCenter(i);
    const S = (x: number) => baseSide(i) * x;
    const slots: THREE.Vector3[] = [];
    for (let f = 0; f < 3; f++) {
      const bandStart = PLOT_INNER_X + 0.5 + f * THIRD;
      const y = f * TIER_H + 0.5;
      // zone offsets within band (x): 앞줄 3 / 뒷줄 2
      const rowA = [bandStart + 1.5, bandStart + THIRD / 2, bandStart + THIRD - 1.5];
      const rowB = [bandStart + THIRD / 2 - 1.1, bandStart + THIRD / 2 + 1.1];
      const zoneZ = (sz: number) => c.z + sz * 3.6;
      const rowBOff = 1.4; // 뒷줄은 중앙 통로 쪽으로 살짝 이동
      for (const sz of [-1, 1] as const) {
        for (const x of rowA) {
          slots.push(new THREE.Vector3(S(x), y, zoneZ(sz)));
        }
        for (const x of rowB) {
          slots.push(new THREE.Vector3(S(x), y, zoneZ(sz) - sz * rowBOff));
        }
      }
    }
    slotCache[i] = slots;
  }

  // ── 지면 높이: 등분 티어 ──────────────────────────────────
  const groundHeight = (x: number, z: number): number => {
    for (let i = 0; i < BASE_COUNT; i++) {
      const c = baseCenter(i);
      if (Math.abs(z - c.z) > PLOT_HALF_Z) continue;
      const side = baseSide(i);
      const ax = Math.abs(x);
      if (ax < PLOT_INNER_X - 1 || ax > PLOT_OUTER_X) continue;
      if (Math.sign(x) !== side) continue;
      const floors = unlocked.get(i) ?? 1;
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
      const pal = SKIN_PALETTE[skin];
      for (const m of targets.frameMats) m.color.setHex(pal.frame);
      for (const m of targets.trimMats) m.color.setHex(pal.trim);
      if (targets.barMat) {
        targets.barMat.color.setHex(pal.bar);
        const idx = rainbowMats.indexOf(targets.barMat);
        if (skin === 'rainbow' && idx < 0) rainbowMats.push(targets.barMat);
        if (skin !== 'rainbow' && idx >= 0) rainbowMats.splice(idx, 1);
      }
      const key = skin;
      let mat = matMaterialCache.get(key);
      if (!mat) {
        mat = floorMaterial(pal.mat[0], 10, 10, { lineDark: 0.12 });
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
  pos.z = Math.max(FIELD_Z_MIN + 1, Math.min(FIELD_Z_MAX - 1, pos.z));
}
