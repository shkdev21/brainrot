import * as THREE from 'three';
import type { Rarity } from '../core/types';
import { RARITY_COLORS } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { makeRng, hashStr } from '../core/rng';

// 절차적 로우폴리 캐릭터 — defId 시드로 결정적 생성.
// 밈 스타일: 동물/음식/사물 하이브리드 실루엣.

const RARITY_SCALE: Record<Rarity, number> = {
  common: 1.0, rare: 1.15, epic: 1.3, legendary: 1.5, mythic: 1.75, god: 2.0, secret: 2.2,
};

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/** 몸통 형태 5종 */
function buildBody(rng: () => number, mat: THREE.Material): THREE.Mesh {
  const kind = Math.floor(rng() * 5);
  switch (kind) {
    case 0: return new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.9), mat);        // 박스
    case 1: return new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.8, 4, 10), mat); // 캡슐
    case 2: return new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.3, 10), mat); // 원뿔대
    case 3: return new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), mat);      // 구
    default: return new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), mat);    // 12면체
  }
}

/** 머리 형태 */
function buildHead(rng: () => number, mat: THREE.Material): THREE.Mesh {
  const kind = Math.floor(rng() * 4);
  switch (kind) {
    case 0: return new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), mat);
    case 1: return new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat);
    case 2: return new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 8), mat);
    default: return new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat);
  }
}

/** 부속물 — 밈 감성 */
function buildAccessory(rng: () => number, mat: THREE.Material): THREE.Mesh {
  const kind = Math.floor(rng() * 5);
  switch (kind) {
    case 0: // 날개
      return new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 4), mat);
    case 1: // 바퀴
      return new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 6, 14).rotateY(Math.PI / 2), mat);
    case 2: // 시계/원반
      return new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 12).rotateX(Math.PI / 2), mat);
    case 3: // 뿔
      return new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), mat);
    default: // 팔(사탕) — 길쭉한 실린더
      return new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 6), mat);
  }
}

export interface BrainrotVisual {
  group: THREE.Group;
  /** 무지개 애니메이션 대상 머티리얼 */
  rainbowMats: THREE.MeshLambertMaterial[];
  bobPhase: number;
}

export function buildBrainrotMesh(
  defId: string,
  rarity: Rarity,
  mutation: string | null,
): BrainrotVisual {
  const rng = makeRng(hashStr(defId));
  const group = new THREE.Group();

  const bodyColor = 0.4 + rng() * 0.4;
  const baseHue = rng();
  const bodyColorHex = new THREE.Color().setHSL(baseHue, 0.55, bodyColor).getHex();
  const accentColorHex = new THREE.Color().setHSL((baseHue + 0.4) % 1, 0.6, 0.5).getHex();

  const mut = mutation ? MUTATION_BY_ID.get(mutation) : null;

  const bodyMat = lambert(bodyColorHex);
  const accentMat = lambert(accentColorHex);
  const rarityGlowMat = lambert(RARITY_COLORS[rarity] ?? 0xffffff);

  const body = buildBody(rng, bodyMat);
  body.position.y = 0.8;
  body.castShadow = true;
  group.add(body);

  const head = buildHead(rng, accentMat);
  head.position.y = 1.75;
  head.castShadow = true;
  group.add(head);

  // 눈 2개
  const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const eyeMat = lambert(0x1a1a1a);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.18, 1.82, 0.32);
    group.add(eye);
  }

  // 다리 2개
  const legGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.6, 6);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, accentMat);
    leg.position.set(sx * 0.3, 0.3, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  // 부속물: 등 위 + 양옆
  const acc1 = buildAccessory(rng, rarityGlowMat);
  acc1.position.set(0, 1.9, -0.5);
  acc1.rotation.x = -0.4;
  group.add(acc1);
  for (const sx of [-1, 1]) {
    if (rng() > 0.5) {
      const acc = buildAccessory(rng, accentMat);
      acc.position.set(sx * 0.85, 0.9, 0);
      group.add(acc);
    }
  }

  // 등급 링 (발밑 광륜)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.06, 6, 24).rotateX(Math.PI / 2),
    lambert(RARITY_COLORS[rarity] ?? 0xffffff),
  );
  ring.position.y = 0.05;
  group.add(ring);

  const scale = RARITY_SCALE[rarity];
  group.scale.setScalar(scale);

  // 변이 색 오버라이드 — 몸통/악센트를 변이색으로
  const rainbowMats: THREE.MeshLambertMaterial[] = [];
  if (mut) {
    const tint = new THREE.Color(mut.colorHex);
    bodyMat.color.copy(tint).multiplyScalar(0.85);
    accentMat.color.copy(tint).multiplyScalar(1.15).offsetHSL(0.05, 0, 0.05);
    if (mut.id === 'rainbow') {
      rainbowMats.push(bodyMat, accentMat);
    }
  }

  return { group, rainbowMats, bobPhase: rng() * Math.PI * 2 };
}

/** 아바타(플레이어/봇) — 로우폴리 휴머노이드 */
export function buildAvatar(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const skin = lambert(colorHex);
  const dark = lambert(0x333a44);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), skin);
  torso.position.y = 1.1;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 5);
  const eyeMat = lambert(0x111111);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.13, 1.88, 0.26);
    g.add(eye);
  }

  const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.28);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(sx * 0.19, 0.33, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(sx * 0.47, 1.15, 0);
    arm.castShadow = true;
    g.add(arm);
  }
  return g;
}

/** 무지개 변이 애니메이션 — render 루프에서 호출 */
export function animateRainbow(mats: THREE.MeshLambertMaterial[], t: number, phase: number): void {
  for (let i = 0; i < mats.length; i++) {
    mats[i].color.setHSL((t * 0.25 + phase + i * 0.15) % 1, 0.85, 0.6);
  }
}
