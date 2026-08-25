import * as THREE from 'three';
import type { Rarity } from '../core/types';
import { RARITY_COLORS } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { makeRng, hashStr } from '../core/rng';

// 밈 스타일 생물 생성기 — 원작 감성: 큰 머리, 통통한 몸, 과장된 운동화.
// defId 시드로 결정적 생성, 12가지 테마 실루엣.

const RARITY_SCALE: Record<Rarity, number> = {
  common: 1.0, rare: 1.12, epic: 1.25, legendary: 1.4, mythic: 1.6, god: 1.8, secret: 2.0,
};

type Theme =
  | 'shark' | 'croco' | 'banana' | 'coffee' | 'ballerina' | 'cactus'
  | 'potato' | 'camel' | 'bird' | 'pineapple' | 'dino' | 'fish';

const THEMES: Theme[] = [
  'shark', 'croco', 'banana', 'coffee', 'ballerina', 'cactus',
  'potato', 'camel', 'bird', 'pineapple', 'dino', 'fish',
];

function lam(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/** 과장된 운동화 — 흰 두꺼운 밑창 + 컬러 갑피 (브레인롯 밈 상징) */
function sneakers(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const upper = lam(new THREE.Color().setHSL(rng(), 0.7, 0.5).getHex());
  const sole = lam(0xf8f9fa);
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.95), sole);
  toe.position.y = 0.12;
  g.add(toe);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.62), upper);
  top.position.set(0, 0.42, 0.08);
  g.add(top);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.2), lam(0xffffff));
  tongue.position.set(0, 0.62, 0.32);
  g.add(tongue);
  return g;
}

/** 큰 만화 눈 — 흰자+검은 동공 */
function bigEyes(group: THREE.Group, y: number, z: number, spread: number, size = 0.2): void {
  const whiteMat = lam(0xffffff);
  const pupilMat = lam(0x141414);
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), whiteMat);
    white.position.set(sx * spread, y, z);
    white.scale.set(1, 1.25, 0.6);
    group.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 8, 6), pupilMat);
    pupil.position.set(sx * spread, y, z + size * 0.5);
    group.add(pupil);
  }
}

/** 통통한 팔 */
function stubbyArms(group: THREE.Group, mat: THREE.Material, y: number, spread: number): void {
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 4, 8), mat);
    arm.position.set(sx * spread, y, 0);
    arm.rotation.z = sx * 0.5;
    arm.castShadow = true;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat);
    hand.position.set(sx * (spread + 0.22), y - 0.35, 0);
    group.add(hand);
  }
}

export interface BrainrotVisual {
  group: THREE.Group;
  rainbowMats: THREE.MeshLambertMaterial[];
  bobPhase: number;
}

export function buildBrainrotMesh(
  defId: string,
  rarity: Rarity,
  mutation: string | null,
): BrainrotVisual {
  const rng = makeRng(hashStr(defId));
  const theme = THEMES[Math.floor(rng() * THEMES.length)];
  const group = new THREE.Group();

  const hue = rng();
  const bodyColor = new THREE.Color().setHSL(hue, 0.6, 0.5);
  const accentColor = new THREE.Color().setHSL((hue + 0.45) % 1, 0.65, 0.55);
  const bodyMat = lam(bodyColor.getHex());
  const accentMat = lam(accentColor.getHex());
  const whiteMat = lam(0xf4f4f4);
  const darkMat = lam(0x2d3436);

  // 몸통 (테마별)
  switch (theme) {
    case 'shark': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.9, 6, 12).rotateX(Math.PI / 2), bodyMat);
      body.position.y = 1.05;
      body.castShadow = true;
      group.add(body);
      const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.7, 4, 10).rotateX(Math.PI / 2), whiteMat);
      belly.position.set(0, 0.85, 0.1);
      group.add(belly);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), bodyMat);
      fin.position.y = 2.0;
      fin.castShadow = true;
      group.add(fin);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4).rotateX(-Math.PI / 2), bodyMat);
      tail.position.set(0, 1.1, -0.95);
      tail.rotation.x = 0.4;
      group.add(tail);
      bigEyes(group, 1.45, 0.62, 0.28);
      stubbyArms(group, bodyMat, 1.0, 0.72);
      break;
    }
    case 'croco': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.3), bodyMat);
      body.position.y = 0.95;
      body.castShadow = true;
      group.add(body);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.9), bodyMat);
      snout.position.set(0, 1.5, 0.75);
      group.add(snout);
      // 이빨
      for (let t = 0; t < 3; t++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), whiteMat);
        tooth.position.set(-0.22 + t * 0.22, 1.32, 1.1);
        tooth.rotation.x = Math.PI;
        group.add(tooth);
      }
      // 등 가시
      for (let s = 0; s < 3; s++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), accentMat);
        spike.position.set(0, 1.45, -0.35 + s * 0.35);
        group.add(spike);
      }
      bigEyes(group, 1.62, 0.35, 0.26, 0.17);
      stubbyArms(group, bodyMat, 0.95, 0.62);
      break;
    }
    case 'banana': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 6, 10), lam(0xffd43b));
      body.position.y = 1.05;
      body.rotation.z = 0.18;
      body.castShadow = true;
      group.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 6), lam(0x8a6d1a));
      tip.position.set(0.22, 1.85, 0);
      group.add(tip);
      bigEyes(group, 1.55, 0.38, 0.24);
      stubbyArms(group, lam(0xffd43b), 1.0, 0.6);
      break;
    }
    case 'coffee': {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 1.0, 14), whiteMat);
      cup.position.y = 1.0;
      cup.castShadow = true;
      group.add(cup);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.55, 0.28, 14), bodyMat);
      band.position.y = 0.85;
      group.add(band);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 8, 14), whiteMat);
      handle.position.set(0.68, 1.05, 0);
      group.add(handle);
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), lam(0xd9a066));
      foam.position.y = 1.75;
      foam.scale.y = 0.7;
      group.add(foam);
      bigEyes(group, 1.75, 0.45, 0.24);
      stubbyArms(group, whiteMat, 1.0, 0.68);
      break;
    }
    case 'ballerina': {
      const tutu = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 12), accentMat);
      tutu.position.y = 0.95;
      tutu.rotation.x = Math.PI;
      group.add(tutu);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 4, 10), bodyMat);
      torso.position.y = 1.55;
      torso.castShadow = true;
      group.add(torso);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), accentMat);
      bun.position.y = 2.35;
      group.add(bun);
      bigEyes(group, 2.0, 0.26, 0.2, 0.16);
      stubbyArms(group, bodyMat, 1.6, 0.42);
      break;
    }
    case 'cactus': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.5, 10), lam(0x37b24d));
      trunk.position.y = 1.15;
      trunk.castShadow = true;
      group.add(trunk);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), lam(0x37b24d));
        arm.position.set(sx * 0.55, 1.35, 0);
        arm.rotation.z = sx * -0.9;
        group.add(arm);
      }
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), accentMat);
      flower.position.y = 2.0;
      group.add(flower);
      bigEyes(group, 1.5, 0.42, 0.22, 0.15);
      break;
    }
    case 'potato': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), lam(0xb08554));
      body.position.y = 1.0;
      body.scale.set(1.1, 0.92, 0.95);
      body.castShadow = true;
      group.add(body);
      for (let d = 0; d < 3; d++) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), lam(0x9a7146));
        bump.position.set(rng() * 0.8 - 0.4, 0.8 + rng() * 0.7, 0.6);
        group.add(bump);
      }
      bigEyes(group, 1.25, 0.58, 0.26);
      stubbyArms(group, lam(0xb08554), 1.0, 0.72);
      break;
    }
    case 'camel': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 1.4), bodyMat);
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);
      for (const hz of [-0.35, 0.3]) {
        const hump = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bodyMat);
        hump.position.set(0, 1.55, hz);
        hump.scale.y = 0.9;
        group.add(hump);
      }
      const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 4, 8), bodyMat);
      neck.position.set(0, 1.7, 0.75);
      neck.rotation.x = 0.5;
      group.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.6), bodyMat);
      head.position.set(0, 2.15, 1.0);
      group.add(head);
      bigEyes(group, 2.2, 1.0, 0.22, 0.14);
      break;
    }
    case 'bird': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), bodyMat);
      body.position.y = 1.05;
      body.castShadow = true;
      group.add(body);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 6).rotateX(Math.PI / 2), lam(0xff922b));
      beak.position.set(0, 1.5, 0.65);
      group.add(beak);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.55), accentMat);
      wingL.position.set(-0.75, 1.25, 0);
      wingL.rotation.z = 0.35;
      group.add(wingL);
      const wingR = wingL.clone();
      wingR.position.x = 0.75;
      wingR.rotation.z = -0.35;
      group.add(wingR);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), accentMat);
      crest.position.y = 1.95;
      group.add(crest);
      bigEyes(group, 1.55, 0.5, 0.25, 0.16);
      break;
    }
    case 'pineapple': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 8), lam(0xe8b430));
      body.position.y = 1.1;
      body.castShadow = true;
      group.add(body);
      for (const s of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 4), lam(0x2f9e44));
        leaf.position.set(s * 0.2, 2.0, 0);
        leaf.rotation.z = s * 0.4;
        group.add(leaf);
      }
      const leafC = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 4), lam(0x2f9e44));
      leafC.position.y = 2.05;
      group.add(leafC);
      bigEyes(group, 1.4, 0.5, 0.25);
      stubbyArms(group, lam(0xe8b430), 1.05, 0.68);
      break;
    }
    case 'dino': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.8, 6, 10), bodyMat);
      body.position.y = 1.0;
      body.rotation.x = 0.3;
      body.castShadow = true;
      group.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 6).rotateX(-Math.PI / 2), bodyMat);
      tail.position.set(0, 0.85, -1.0);
      group.add(tail);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.7), bodyMat);
      head.position.set(0, 1.75, 0.5);
      group.add(head);
      for (let s = 0; s < 4; s++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), accentMat);
        spike.position.set(0, 1.65 - s * 0.2, 0.1 - s * 0.4);
        group.add(spike);
      }
      bigEyes(group, 1.85, 0.75, 0.22, 0.15);
      stubbyArms(group, bodyMat, 1.15, 0.66);
      break;
    }
    case 'fish': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), bodyMat);
      body.position.y = 1.1;
      body.scale.set(0.85, 1, 1.25);
      body.castShadow = true;
      group.add(body);
      const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 4).rotateZ(-Math.PI / 2), accentMat);
      tailFin.position.set(-0.85, 1.1, 0);
      group.add(tailFin);
      const topFin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), accentMat);
      topFin.position.set(0, 1.85, 0);
      group.add(topFin);
      bigEyes(group, 1.25, 0.6, 0.32, 0.19);
      stubbyArms(group, bodyMat, 1.05, 0.6);
      break;
    }
  }

  // 다리 + 과장된 운동화 (공통 — 밈의 핵심)
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.5, 8), darkMat);
    leg.position.set(sx * 0.3, 0.28, 0.1);
    group.add(leg);
    const shoe = sneakers(rng);
    shoe.position.set(sx * 0.3, 0, 0.15);
    shoe.scale.setScalar(1.15);
    group.add(shoe);
  }

  // 등급 광륜
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.07, 6, 24).rotateX(Math.PI / 2),
    lam(RARITY_COLORS[rarity] ?? 0xffffff),
  );
  ring.position.y = 0.08;
  group.add(ring);

  group.scale.setScalar(RARITY_SCALE[rarity] ?? 1);

  // 변이 색 오버라이드
  const rainbowMats: THREE.MeshLambertMaterial[] = [];
  if (mutation) {
    const mut = MUTATION_BY_ID.get(mutation)!;
    const tint = new THREE.Color(mut.colorHex);
    bodyMat.color.copy(tint).multiplyScalar(0.9);
    accentMat.color.copy(tint).offsetHSL(0.06, 0, 0.12);
    if (mut.id === 'rainbow') rainbowMats.push(bodyMat, accentMat);
  }

  return { group, rainbowMats, bobPhase: rng() * Math.PI * 2 };
}

/** 아바타(플레이어/봇) — 밈 감성 운동화를 신은 로우폴리 휴머노이드 */
export function buildAvatar(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const skin = lam(colorHex);
  const dark = lam(0x333a44);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), skin);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), skin);
  head.position.y = 1.88;
  head.castShadow = true;
  g.add(head);
  const eyeMat = lam(0x111111);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeMat);
    eye.position.set(sx * 0.13, 1.92, 0.27);
    g.add(eye);
  }

  const legGeo = new THREE.BoxGeometry(0.25, 0.62, 0.28);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(sx * 0.19, 0.6, 0);
    leg.castShadow = true;
    g.add(leg);
    // 운동화
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.62), lam(0xf8f9fa));
    shoe.position.set(sx * 0.19, 0.14, 0.1);
    g.add(shoe);
    const shoeTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.4), skin);
    shoeTop.position.set(sx * 0.19, 0.32, 0.05);
    g.add(shoeTop);
  }
  const armGeo = new THREE.BoxGeometry(0.18, 0.72, 0.2);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(sx * 0.49, 1.18, 0);
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
