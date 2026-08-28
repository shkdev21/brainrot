import * as THREE from 'three';
import type { PlayerState } from '../core/types';
import { resolveCollisions, type Seg } from './MapBuilder';
import { buildAvatar } from './CharacterMesh';

// 3인칭 플레이어 컨트롤러 — WASD+점프, 마우스 궤도 카메라, 충돌·상태 반영.

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
}

const WALK_SPEED = 6;
const SPRINT_MULT = 1.5;
const CARRY_SLOW = 0.45;      // 운반 시 이속 55%
const JUMP_VEL = 8.5;
const GRAVITY = -24;
const STEP_SNAP = 1.1;        // 계단/테라스 자동 승하강 허용 높이

export class PlayerController {
  readonly mesh: THREE.Group;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  /** 카메라 궤도 각도(수평/수직)와 거리 */
  camYaw = 0;
  camPitch = 0.45;
  camDist = 11;
  grounded = false;

  private keys = new Set<string>();
  private dragging = false;
  private lastMouse: { x: number; y: number } | null = null;
  private knockback = new THREE.Vector3();
  private walkPhase = 0;
  private analogVec: { x: number; z: number } = { x: 0, z: 0 };

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private colliders: Seg[],
    private groundHeight: (x: number, z: number) => number,
    avatarColor: number,
  ) {
    this.mesh = new THREE.Group();
    this.mesh.add(buildAvatar(avatarColor));
    this.bindInput();
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.dragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging || !this.lastMouse) return;
      this.camYaw -= (e.clientX - this.lastMouse.x) * 0.005;
      this.camPitch = Math.max(0.08, Math.min(1.35, this.camPitch + (e.clientY - this.lastMouse.y) * 0.004));
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    this.dom.addEventListener('wheel', (e) => {
      this.camDist = Math.max(5, Math.min(28, this.camDist + e.deltaY * 0.01));
    });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 모바일 조이스틱 아날로그 입력 (화면 위=전방) */
  setAnalog(x: number, z: number): void {
    this.analogVec = { x, z };
  }

  /** 터치 카메라 궤도 */
  orbit(dx: number, dy: number): void {
    this.camYaw -= dx;
    this.camPitch = Math.max(0.08, Math.min(1.35, this.camPitch + dy));
  }

  /** 핀치 줌 */
  zoom(d: number): void {
    this.camDist = Math.max(5, Math.min(28, this.camDist + d));
  }

  private touchJump = false;

  /** 모바일 점프 버튼 상태 설정 */
  setJump(pressed: boolean): void {
    this.touchJump = pressed;
  }

  readInput(): PlayerInput {
    return {
      forward: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      back: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      jump: this.keys.has('Space') || this.touchJump,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  /** 코어 이벤트 → 시각 넉백 */
  addKnockback(dir: { x: number; z: number }, force: number): void {
    this.knockback.x += dir.x * force;
    this.knockback.z += dir.z * force;
  }

  teleportTo(x: number, z: number): void {
    this.pos.x = x;
    this.pos.z = z;
    const gh = this.groundHeight(x, z);
    if (Math.abs(this.pos.y - gh) > STEP_SNAP + 0.5) this.pos.y = gh + 0.5;
    this.vel.set(0, 0, 0);
  }

  /** 코어 상태 반영 업데이트 */
  update(dt: number, p: PlayerState, input: PlayerInput, timeMs: number): void {
    const stunned = timeMs < p.stunUntil;
    const slowed = timeMs < p.slowUntil;
    const invisible = timeMs < p.invisUntil;

    // 이동 (기절 시 입력 무시)
    let speed = WALK_SPEED * (input.sprint ? SPRINT_MULT : 1);
    if (slowed) speed *= CARRY_SLOW + 0.1; // slowUntil = 운반 페널티
    if (stunned) speed = 0;

    const move = new THREE.Vector3();
    if (!stunned) {
      // 화면 기준 입력: sz=+1 화면 위(전방), sx=+1 화면 우측
      let sx = 0;
      let sz = 0;
      if (input.forward) sz += 1;
      if (input.back) sz -= 1;
      if (input.right) sx += 1;
      if (input.left) sx -= 1;
      // 조이스틱 아날로그 입력 우선
      const alen = Math.hypot(this.analogVec.x, this.analogVec.z);
      if (alen > 0.15) {
        sx = this.analogVec.x;
        sz = this.analogVec.z;
        const l2 = Math.hypot(sx, sz);
        sx /= l2; sz /= l2;
      }
      if (sx !== 0 || sz !== 0) {
        const len = Math.hypot(sx, sz);
        sx /= len;
        sz /= len;
        // 화면 전방 f=(sin,cos) — 카메라가 pos-f·dist에 있으므로 f가 화면 위 방향
        // 화면 우측 r=(-cos,sin)
        const cos = Math.cos(this.camYaw);
        const sin = Math.sin(this.camYaw);
        const wx = -sx * cos + sz * sin;
        const wz = sx * sin + sz * cos;
        move.set(wx, 0, wz);
        this.yaw = Math.atan2(wx, wz);
        this.walkPhase += dt * 10 * speed / WALK_SPEED;
      }
    }

    // 넉백 감쇠
    this.knockback.multiplyScalar(Math.max(0, 1 - dt * 4));

    this.pos.x += (move.x * speed + this.knockback.x) * dt;
    this.pos.z += (move.z * speed + this.knockback.z) * dt;

    // 중력/점프
    const gh = this.groundHeight(this.pos.x, this.pos.z);
    if (this.grounded && input.jump && !stunned) {
      this.vel.y = JUMP_VEL * (p.purchasedTools.includes('boots') ? 1.35 : 1);
      this.grounded = false;
    }
    this.vel.y += GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= gh) {
      // 테라스 위로 걸어 올라가기(스텝 스냅) 또는 착지
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y - gh < STEP_SNAP && this.vel.y <= 0) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
    }

    resolveCollisions(this.pos, 0.6, this.colliders);

    // 메시 반영
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    // 걷기 바운스
    const bobbing = move.lengthSq() > 0 && this.grounded
      ? Math.abs(Math.sin(this.walkPhase)) * 0.12 : 0;
    this.mesh.position.y += bobbing;
    // 은신 반투명
    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material;
        m.transparent = invisible;
        m.opacity = invisible ? 0.3 : 1;
      }
    });
    // 기절 표시 — 몸 기울기
    this.mesh.rotation.x = stunned ? 0.5 : 0;

    // 카메라 — 궤도 추적
    const cx = this.pos.x - Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = this.pos.z - Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = this.pos.y + Math.sin(this.camPitch) * this.camDist + 1.5;
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 12));
    this.camera.lookAt(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }

  /** 조준 방향 (xz 평면, 화면 전방 = 카메라가 바라보는 방향) */
  aimDir(): { x: number; z: number } {
    return { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
  }
}
