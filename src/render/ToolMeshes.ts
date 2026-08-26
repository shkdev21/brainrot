import * as THREE from 'three';

// 도구 3D 메시 — 원작 이미지 참고 절차 생성. 손에 들고 사용 애니메이션용.

function lam(color: number, opts: { transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

/** 방망이 — 나무 배트 + 그립 테이프 */
function bat(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.07, 1.1, 10),
    lam(0xB5651D),
  );
  wood.position.y = 0.55;
  wood.castShadow = true;
  g.add(wood);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.28, 10), lam(0x2d3436));
  tape.position.y = 0.12;
  g.add(tape);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lam(0x2d3436));
  knob.position.y = 0.02;
  g.add(knob);
  return g;
}

/** 점프 부츠 — 흰 운동화 */
function boots(): THREE.Group {
  const g = new THREE.Group();
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.55), lam(0xf8f9fa));
  sole.position.y = 0.08;
  g.add(sole);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.38), lam(0xff9f43));
  upper.position.set(0, 0.26, 0.05);
  g.add(upper);
  const spring = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.04, 6, 12).rotateY(Math.PI / 2),
    lam(0xa4b0be),
  );
  spring.position.y = -0.04;
  g.add(spring);
  return g;
}

/** 투명 망토 — 반투명 케이프 */
function cloak(): THREE.Group {
  const g = new THREE.Group();
  const cape = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.15, 10, 1, true),
    lam(0x9d6bff, { transparent: true, opacity: 0.55 }),
  );
  cape.position.y = 0.62;
  g.add(cape);
  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lam(0xd4a017));
  clasp.position.set(0, 1.1, 0.16);
  g.add(clasp);
  return g;
}

/** 디스코볼 — 은색 구 + 컬러 조각 */
function disco(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), lam(0xc8d6e5));
  ball.castShadow = true;
  g.add(ball);
  const shards = [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x6c5ce7, 0x26de81];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.02),
      lam(shards[i]),
    );
    const a = (i / 5) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.2, 0.28);
    g.add(s);
  }
  return g;
}

/** 메두사의 머리 — 초록 뱀 무리 */
function medusa(): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(0x2f9e44));
  head.castShadow = true;
  g.add(head);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const snake = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.05, 0.42, 3, 6),
      lam(0x37b24d),
    );
    snake.position.set(Math.cos(a) * 0.2, 0.32, Math.sin(a) * 0.2);
    snake.rotation.z = Math.cos(a) * 0.6;
    snake.rotation.x = Math.sin(a) * 0.6;
    g.add(snake);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), lam(0xffe066));
    eye.position.set(Math.cos(a) * 0.2, 0.55, Math.sin(a) * 0.2);
    g.add(eye);
  }
  return g;
}

/** 웹 슬링거 — 손등 발사기 */
function web(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.26), lam(0x57606f));
  g.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.03, 6, 14),
    lam(0xecf0f1),
  );
  ring.position.z = 0.14;
  g.add(ring);
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4),
    lam(0xecf0f1),
  );
  string.rotation.x = Math.PI / 2;
  string.position.z = 0.28;
  g.add(string);
  return g;
}

/** 대쉬 검 — 청색 칼 */
function sword(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 1.15, 0.03),
    lam(0x74b9ff),
  );
  blade.position.y = 0.78;
  blade.castShadow = true;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.18, 4), lam(0x74b9ff));
  tip.position.y = 1.44;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), lam(0xd4a017));
  guard.position.y = 0.2;
  g.add(guard);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), lam(0x2d3436));
  hilt.position.y = 0.05;
  g.add(hilt);
  return g;
}

/** 순간이동기 — 시안 수정 */
function blink(): THREE.Group {
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26),
    lam(0x00d2d3, { transparent: true, opacity: 0.8 }),
  );
  crystal.position.y = 0.28;
  g.add(crystal);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.035, 6, 14).rotateX(Math.PI / 2),
    lam(0x55efc4),
  );
  ring.position.y = 0.06;
  g.add(ring);
  return g;
}

/** 터렛 배터리 — 소형 포탑 (설치형은 기존 것 사용) */
function turretPack(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.24), lam(0x556070));
  box.castShadow = true;
  g.add(box);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6).rotateX(Math.PI / 2), lam(0x20bf6b));
  barrel.position.set(0, 0.1, 0.22);
  g.add(barrel);
  return g;
}

/** 함정 키트 — 회색 원판 */
function trapKit(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 12), lam(0x8d6e2f));
  disc.position.y = 0.05;
  g.add(disc);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), lam(0xdfe6e9));
    tooth.position.set(Math.cos(a) * 0.24, 0.14, Math.sin(a) * 0.24);
    g.add(tooth);
  }
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  bat, trap: trapKit, boots, cloak, disco, medusa, web,
  turret: turretPack, sword, blink,
};

/** 도구 손에 들기용 메시 (없으면 null) */
export function buildToolMesh(toolId: string): THREE.Group | null {
  const b = BUILDERS[toolId];
  return b ? b() : null;
}
