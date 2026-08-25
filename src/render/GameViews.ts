import * as THREE from 'three';
import { Game } from '../core/GameState';
import { brainrotById } from '../data/brainrots';
import { MUTATION_BY_ID } from '../data/mutations';
import { displayName } from '../core/names';
import { hashStr } from '../core/rng';
import { formatMoney, instanceIncome } from '../core/Economy';
import { tryPickUp, arriveOwnBase, droppedPositions } from '../core/Carry';
import { lockBase, canEnterBase } from '../core/BaseLock';
import { useTool, purchaseTool } from '../core/ToolEffects';
import { BotBrain, type BotIntent } from '../core/Bots';
import { baseCenter, inBaseZone, inCarpetZone, dist2d, CARPET_WALK_MS } from '../core/Layout';
import { GameScene } from './Scene';
import type { MapRefs } from './MapBuilder';
import { resolveCollisions } from './MapBuilder';
import { buildBrainrotMesh, buildAvatar, animateRainbow } from './CharacterMesh';
import { PlayerController } from './PlayerController';

// 통합 계층 — core 시뮬레이션(20Hz)과 렌더링(rAF)을 잇는 모든 뷰 로직.

const BOT_COLORS = [0xe17055, 0x00b894, 0x0984e3, 0x6c5ce7, 0xd63031, 0xfdcb6e, 0xe84393];

interface BrainrotView {
  uid: string;
  visual: ReturnType<typeof buildBrainrotMesh>;
  label: THREE.Sprite;
  coin: THREE.Mesh;
  /** 기지까지 걷기 보간 */
  walk: { from: THREE.Vector3; to: THREE.Vector3; until: number } | null;
  /** 카펫 컨베이어 걷기 시작 시각 (carpet 상태) */
  carpetStartAt: number | null;
  /** 카펫 x 지터 (동시 스폰 겹침 방지) */
  carpetJitter: number;
}

interface BotView {
  id: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  brain: BotBrain;
  target: { x: number; z: number } | null;
}

export class GameViews {
  readonly game: Game;
  private player: PlayerController;
  private brainrotViews = new Map<string, BrainrotView>();
  private botViews: BotView[] = [];
  private labelCache = new Map<string, THREE.Sprite>();
  private coinGeo = new THREE.TetrahedronGeometry(0.22);
  private coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });
  private trapMeshes = new Map<string, THREE.Mesh>();
  private turretMeshes = new Map<string, THREE.Group>();
  private debugEl: HTMLDivElement;
  private accum = 0;
  private lastRaidToastAt = 0;
  onToast: (msg: string) => void = () => {};

  constructor(
    private gs: GameScene,
    private map: MapRefs,
    seed?: number,
  ) {
    this.game = new Game({ seed });

    // 플레이어 — 자기 기지 문 앞에서 시작
    this.player = new PlayerController(
      gs.camera, gs.renderer.domElement, map.colliders, map.groundHeight, 0x74b9ff,
    );
    const door0 = map.doorCenter(0);
    // 서쪽(기지0) 문에서 거리 쪽으로 2.5m
    this.player.teleportTo(door0.x + 2.5, door0.z);
    this.player.camYaw = -Math.PI / 2; // 거리(동쪽)를 바라봄
    gs.scene.add(this.player.mesh);

    // 봇 아바타
    for (let i = 1; i < 8; i++) {
      const id = `b${i}`;
      const c = baseCenter(i);
      const mesh = buildAvatar(BOT_COLORS[(i - 1) % BOT_COLORS.length]);
      mesh.position.set(c.x, 0, c.z);
      gs.scene.add(mesh);
      this.botViews.push({
        id, mesh, pos: new THREE.Vector3(c.x, 0, c.z),
        brain: new BotBrain(id, (seed ?? 1) * 131 + i * 977),
        target: null,
      });
      this.game.state.positions[id] = { x: c.x, z: c.z };
    }
    this.game.state.positions.p0 = { x: door0.x, z: door0.z };

    // 코어 이벤트 → 뷰
    const ev = this.game.events;
    ev.on('spawned', ({ uid }) => this.onSpawned(uid));
    ev.on('purchased', ({ uid }) => this.onPurchased(uid));
    ev.on('ownership-transferred', ({ uid }) => this.onTransferred(uid));
    ev.on('dropped', ({ uid }) => this.onDropped(uid));
    ev.on('despawned', ({ uid }) => this.removeView(uid));
    ev.on('locked', ({ baseId }) => this.map.setBaseLocked(baseId, true));
    ev.on('unlocked', ({ baseId }) => this.map.setBaseLocked(baseId, false));
    ev.on('arrived', ({ uid }) => this.snapToSlot(uid));
    ev.on('knockback', ({ targetId, dir, force }) => {
      if (targetId === 'p0') this.player.addKnockback(dir, force);
      else {
        const bv = this.botViews.find((b) => b.id === targetId);
        if (bv) {
          bv.pos.x += dir.x * force * 0.25;
          bv.pos.z += dir.z * force * 0.25;
        }
      }
    });
    ev.on('teleported', ({ playerId, to }) => {
      if (playerId === 'p0') this.player.teleportTo(to.x, to.z);
      else {
        const bv = this.botViews.find((b) => b.id === playerId);
        if (bv) bv.pos.set(to.x, bv.pos.y, to.z);
      }
    });
    ev.on('dash', ({ playerId, dir, distance }) => {
      if (playerId === 'p0') this.player.addKnockback(dir, distance * 1.6);
    });
    ev.on('trap-placed', ({ trapId, pos }) => this.placeTrapMesh(trapId, pos));
    ev.on('trap-triggered', ({ trapId }) => this.removeTrapMesh(trapId));
    ev.on('turret-placed', ({ turretId, pos }) => this.placeTurretMesh(turretId, pos));
    ev.on('turret-expired', ({ turretId }) => this.removeTurretMesh(turretId));
    ev.on('steal-started', ({ thiefId, fromBaseId }) => {
      const base = this.game.base(fromBaseId);
      if (base && base.ownerId === 'p0' && this.game.state.timeMs - this.lastRaidToastAt > 4000) {
        this.lastRaidToastAt = this.game.state.timeMs;
        this.onToast('🚨 내 기지에서 브레인롯이 도난당하고 있어요!');
      }
      void thiefId;
    });

    // 디버그 HUD (Task 11에서 정식 HUD로 교체)
    this.debugEl = document.createElement('div');
    this.debugEl.style.cssText =
      'position:fixed;top:10px;left:10px;color:#fff;background:rgba(0,0,0,.5);padding:8px 12px;border-radius:8px;font:600 14px sans-serif;z-index:10;pointer-events:none;white-space:pre;';
    document.getElementById('ui')!.appendChild(this.debugEl);

    this.bindInteractions();
  }

  // ── 상호작용 바인딩 ─────────────────────────────────────

  private bindInteractions(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const p = this.game.player('p0')!;
      const now = this.game.state.timeMs;
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'KeyF' && now >= p.stunUntil) {
        const pad = this.map.lockPadPos(p.baseId);
        if (dist2d({ x: this.player.pos.x, z: this.player.pos.z }, { x: pad.x, z: pad.z }) < 3.5) {
          const res = lockBase(this.game, 'p0');
          if (res.ok) this.onToast('🔒 기지를 잠갔습니다 (20초)');
        }
      }
      // 도구 단축키 1~0
      const idx = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'].indexOf(e.code);
      if (idx >= 0 && now >= p.stunUntil && !p.carrying) {
        const toolId = p.purchasedTools[idx];
        if (toolId) this.usePlayerTool(toolId);
      }
    });
  }

  private usePlayerTool(toolId: string): void {
    const aim = this.player.aimDir();
    const pos = this.player.pos;
    // 웹 슬링처럼 대상 지정이 필요한 도구: 조준 방향 근처 봇 탐색
    let targetId: string | undefined;
    let bestDot = 0.5;
    for (const b of this.botViews) {
      const dx = b.pos.x - pos.x;
      const dz = b.pos.z - pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 16) continue;
      const dot = (dx / len) * aim.x + (dz / len) * aim.z;
      if (dot > bestDot) {
        bestDot = dot;
        targetId = b.id;
      }
    }
    const res = useTool(this.game, 'p0', toolId, {
      aimDir: aim,
      pos: { x: pos.x, z: pos.z },
      targetId,
    });
    if (!res.ok && res.reason === 'on-cooldown') this.onToast('⏳ 쿨타임 중입니다');
    if (res.ok && res.hits && res.hits.length > 0) this.onToast('💥 적중!');
  }

  /** E 키 — 상황별 구매/훔치기/회수 */
  private tryInteract(): void {
    const g = this.game;
    const p = g.player('p0')!;
    if (g.state.timeMs < p.stunUntil) return;
    const ppos = { x: this.player.pos.x, z: this.player.pos.z };

    // 1) 카펫 구매
    let bestCarpet: { uid: string; d: number } | null = null;
    for (const inst of g.state.brainrots) {
      if (inst.location !== 'carpet') continue;
      const view = this.brainrotViews.get(inst.uid);
      if (!view) continue;
      const d = dist2d(ppos, { x: view.visual.group.position.x, z: view.visual.group.position.z });
      if (d < 3.2 && (!bestCarpet || d < bestCarpet.d)) bestCarpet = { uid: inst.uid, d };
    }
    if (bestCarpet) {
      const res = g.buy('p0', bestCarpet.uid);
      if (res.ok) {
        const inst = g.instance(bestCarpet.uid)!;
        this.onToast(`🛒 ${displayName(inst.defId)} 구매!`);
      } else if (res.reason === 'not-enough-money') {
        this.onToast('💸 돈이 부족해요');
      } else if (res.reason === 'base-full') {
        this.onToast('📦 기지가 가득 찼어요 (환생 or 판매 필요)');
      }
      return;
    }

    // 2) 훔치기/회수 (타 기지 or 드롭)
    let bestSteal: { uid: string; d: number } | null = null;
    for (const inst of g.state.brainrots) {
      if (inst.location !== 'base' && inst.location !== 'dropped') continue;
      if (inst.location === 'base' && inst.ownerId === 'p0') continue;
      const view = this.brainrotViews.get(inst.uid);
      if (!view) continue;
      const d = dist2d(ppos, { x: view.visual.group.position.x, z: view.visual.group.position.z });
      if (d < 2.8 && (!bestSteal || d < bestSteal.d)) bestSteal = { uid: inst.uid, d };
    }
    if (bestSteal && !p.carrying) {
      const res = tryPickUp(g, 'p0', bestSteal.uid);
      if (res.ok) {
        const inst = g.instance(bestSteal.uid)!;
        this.onToast(`🥷 ${displayName(inst.defId)} 훔쳤다! 기지로 도망쳐!`);
      } else if (res.reason === 'base-locked') {
        this.onToast('🔒 잠긴 기지입니다');
      }
    }
  }

  // ── 이벤트 핸들러 ────────────────────────────────────────

  private onSpawned(uid: string): void {
    const inst = this.game.instance(uid);
    if (!inst) return;
    const def = brainrotById.get(inst.defId)!;
    const visual = buildBrainrotMesh(def.id, def.rarity, inst.mutation);
    // 카펫 북쪽 출입구에서 등장 — 좌우 지터로 겹침 방지
    const jitter = ((hashStr(uid) % 100) / 100 - 0.5) * 3.6;
    const start = this.map.carpetStart.clone();
    start.x += jitter;
    visual.group.position.copy(start);
    visual.group.rotation.y = Math.PI; // 남쪽(+z)으로 걸으므로 반대 방향 정면
    this.gs.scene.add(visual.group);

    const view: BrainrotView = {
      uid, visual,
      label: this.makeLabel(inst.defId, def.rarity, inst.mutation),
      coin: new THREE.Mesh(this.coinGeo, this.coinMat),
      walk: null,
      carpetStartAt: this.game.state.timeMs,
      carpetJitter: jitter,
    };
    view.label.position.set(start.x, 2.6 * visual.group.scale.x + 0.8, start.z);
    view.coin.visible = false;
    this.gs.scene.add(view.label);
    this.gs.scene.add(view.coin);
    this.brainrotViews.set(uid, view);
  }

  private onPurchased(uid: string): void {
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    view.carpetStartAt = null;
    // 기지 슬롯까지 걷기
    const to = inst.slot ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst)) : new THREE.Vector3();
    view.walk = {
      from: view.visual.group.position.clone(),
      to,
      until: this.game.state.timeMs + 2000,
    };
  }

  private onTransferred(uid: string): void {
    // 훔친 브레인롯이 새 소유자 기지로 걸어감
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    const holder = [...this.game.state.players].find((p) => p.carrying === null && inst.ownerId === p.id);
    void holder;
    const to = inst.slot ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst)) : new THREE.Vector3();
    view.walk = {
      from: view.visual.group.position.clone(),
      to,
      until: this.game.state.timeMs + 1000,
    };
  }

  private onDropped(uid: string): void {
    const view = this.brainrotViews.get(uid);
    if (!view) return;
    // 운반자 위치에 놓기
    let dropPos = view.visual.group.position.clone();
    for (const p of this.game.state.players) {
      if (this.game.state.positions[p.id]) {
        const pp = this.game.state.positions[p.id];
        // 가장 가까운 플레이어 위치 (드롭 직후이므로 근사)
        dropPos = new THREE.Vector3(pp.x, this.map.groundHeight(pp.x, pp.z), pp.z);
        break;
      }
    }
    view.visual.group.position.copy(dropPos);
    view.label.position.set(dropPos.x, dropPos.y + 2.2, dropPos.z);
    view.coin.visible = false;
    droppedPositions.set(uid, { x: dropPos.x, z: dropPos.z });
  }

  private snapToSlot(uid: string): void {
    const inst = this.game.instance(uid);
    const view = this.brainrotViews.get(uid);
    if (!inst || !view) return;
    view.walk = null;
    const pos = inst.slot
      ? this.map.slotPos(inst.slot.baseId, this.floorSlotIndex(inst))
      : view.visual.group.position;
    view.visual.group.position.copy(pos);
    view.label.position.set(pos.x, pos.y + 2.0, pos.z);
    view.coin.visible = inst.earning;
    view.coin.position.set(pos.x + 0.5, pos.y + 1.6, pos.z);
    // 층 해금 반영
    const base = this.game.base(inst.slot!.baseId);
    if (base) this.map.setFloors(base.id, base.unlockedFloors);
  }

  private floorSlotIndex(inst: { slot: { floor: number; index: number } | null }): number {
    if (!inst.slot) return 0;
    return (inst.slot.floor - 1) * 10 + inst.slot.index;
  }

  private removeView(uid: string): void {
    const view = this.brainrotViews.get(uid);
    if (!view) return;
    this.gs.scene.remove(view.visual.group);
    this.gs.scene.remove(view.label);
    this.gs.scene.remove(view.coin);
    this.brainrotViews.delete(uid);
    droppedPositions.delete(uid);
  }

  private placeTrapMesh(id: string, pos: { x: number; z: number }): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.0, 0.18, 12),
      new THREE.MeshLambertMaterial({ color: 0x8d6e2f }),
    );
    mesh.position.set(pos.x, 0.15, pos.z);
    this.gs.scene.add(mesh);
    this.trapMeshes.set(id, mesh);
  }

  private removeTrapMesh(id: string): void {
    const m = this.trapMeshes.get(id);
    if (m) {
      this.gs.scene.remove(m);
      this.trapMeshes.delete(id);
    }
  }

  private placeTurretMesh(id: string, pos: { x: number; z: number }): void {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.5, 10),
      new THREE.MeshLambertMaterial({ color: 0x556070 }),
    );
    base.position.y = 0.25;
    g.add(base);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x20bf6b }),
    );
    head.position.y = 0.8;
    g.add(head);
    g.position.set(pos.x, this.map.groundHeight(pos.x, pos.z), pos.z);
    this.gs.scene.add(g);
    this.turretMeshes.set(id, g);
  }

  private removeTurretMesh(id: string): void {
    const g = this.turretMeshes.get(id);
    if (g) {
      this.gs.scene.remove(g);
      this.turretMeshes.delete(id);
    }
  }

  private makeLabel(defId: string, rarity: string, mutation: string | null): THREE.Sprite {
    const key = `${defId}|${mutation ?? ''}`;
    const cached = this.labelCache.get(key);
    if (cached) return cached.clone();

    const def = brainrotById.get(defId)!;
    const mutText = mutation ? ` ${MUTATION_BY_ID.get(mutation)!.mult}x` : '';
    const text = `${displayName(defId)}${mutText}\n${formatMoney(def.baseIncome)}/s · ${formatMoney(def.price)}`;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    const rarityColor: Record<string, string> = {
      common: '#b0b0b0', rare: '#4da6ff', epic: '#b44dff', legendary: '#ffb020',
      mythic: '#ff4d5e', god: '#39ff88', secret: '#cfcfe8',
    };
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.roundRect?.(6, 6, 500, 148, 20);
    ctx.fill();
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = rarityColor[rarity] ?? '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text.split('\n')[0], 256, 66);
    ctx.font = '38px sans-serif';
    ctx.fillStyle = '#ffe066';
    ctx.fillText(text.split('\n')[1], 256, 120);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(4.6, 1.45, 1);
    this.labelCache.set(key, sprite);
    return sprite.clone();
  }

  // ── 메인 루프 ────────────────────────────────────────────

  start(): void {
    this.gs.onFrame((dt) => {
      // 고정 스텝 코어 틱
      this.accum += dt * 1000;
      const STEP = 50;
      let steps = 0;
      while (this.accum >= STEP && steps < 6) {
        this.accum -= STEP;
        steps++;
        this.game.tick(STEP);
        this.updateBots();
        this.syncPositions();
      }
      this.updateRender(dt);
    });
  }

  private syncPositions(): void {
    this.game.state.positions.p0 = { x: this.player.pos.x, z: this.player.pos.z };
    for (const b of this.botViews) {
      this.game.state.positions[b.id] = { x: b.pos.x, z: b.pos.z };
    }
  }

  private updateBots(): void {
    const g = this.game;
    for (const bv of this.botViews) {
      const me = g.player(bv.id)!;
      if (g.state.timeMs < me.stunUntil) continue;
      const intent: BotIntent = bv.brain.update(g);
      this.applyBotIntent(bv, intent);
    }
  }

  private applyBotIntent(bv: BotView, intent: BotIntent): void {
    const g = this.game;
    const me = g.player(bv.id)!;
    const myPos = { x: bv.pos.x, z: bv.pos.z };

    if (intent.buyToolId) purchaseTool(g, bv.id, intent.buyToolId);
    if (intent.buySpawnUid && inCarpetZone(myPos, 4)) {
      const r = g.buy(bv.id, intent.buySpawnUid);
      if (r.ok) this.onToast(`🤖 ${me.name}가 브레인롯을 샀다`);
    }
    if (intent.pickUpUid && !me.carrying) {
      const target = g.instance(intent.pickUpUid);
      if (target && target.location === 'base' && target.slot) {
        if (inBaseZone(myPos, target.slot.baseId, 2)) {
          tryPickUp(g, bv.id, target.uid);
        }
      } else if (target && target.location === 'dropped') {
        tryPickUp(g, bv.id, target.uid);
      }
    }
    if (intent.lockBase && dist2d(myPos, baseCenter(me.baseId)) < 6) {
      lockBase(g, bv.id);
    }
    if (intent.useTool && !me.carrying) {
      const { toolId, targetId } = intent.useTool;
      let aim = { x: 0, z: 1 };
      if (targetId) {
        const tp = g.state.positions[targetId];
        if (tp) {
          const dx = tp.x - myPos.x;
          const dz = tp.z - myPos.z;
          const len = Math.hypot(dx, dz) || 1;
          aim = { x: dx / len, z: dz / len };
        }
      }
      useTool(g, bv.id, toolId, { aimDir: aim, pos: myPos, targetId });
    }

    // 이동
    if (intent.moveTo && g.state.timeMs >= me.stunUntil) {
      bv.target = intent.moveTo;
    }
    if (me.carrying) {
      // 귀환 — 도착 시 소유권 이전
      const home = baseCenter(me.baseId);
      if (dist2d(myPos, home) < 5) {
        if (arriveOwnBase(g, bv.id).ok) {
          bv.brain.notifyRaidEnded(g);
          this.onToast(`😱 ${me.name}가 우리 것을 훔쳐갔어요!`);
        }
      }
    }
  }

  private updateBotMovement(dt: number): void {
    for (const bv of this.botViews) {
      const me = this.game.player(bv.id)!;
      if (this.game.state.timeMs < me.stunUntil) {
        bv.mesh.rotation.x = 0.4;
        continue;
      }
      bv.mesh.rotation.x = 0;
      if (bv.target) {
        const dx = bv.target.x - bv.pos.x;
        const dz = bv.target.z - bv.pos.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.5) {
          const speed = 5.2 * (this.game.state.timeMs < me.slowUntil ? 0.55 : 1);
          bv.pos.x += (dx / len) * speed * dt;
          bv.pos.z += (dz / len) * speed * dt;
          bv.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      resolveCollisions(bv.pos, 0.6, this.map.colliders);
      bv.pos.y = this.map.groundHeight(bv.pos.x, bv.pos.z);
      bv.mesh.position.copy(bv.pos);
    }
  }

  private updateRender(dt: number): void {
    const g = this.game;
    const now = g.state.timeMs;
    const t = now / 1000;

    // 플레이어
    const p0 = g.player('p0')!;
    this.player.update(dt, p0, this.player.readInput(), now);

    // 문 통과 차단 (잠긴 타 기지)
    const ppos = { x: this.player.pos.x, z: this.player.pos.z };
    for (const base of g.state.bases) {
      if (base.ownerId === 'p0') continue;
      if (!inBaseZone(ppos, base.id, 1)) continue;
      if (canEnterBase(g, 'p0', base.id)) continue;
      // 밀어내기 — 기지 중심 반대 방향
      const c = baseCenter(base.id);
      const dx = ppos.x - c.x;
      const dz = ppos.z - c.z;
      const len = Math.hypot(dx, dz) || 1;
      this.player.pos.x += (dx / len) * 12 * dt;
      this.player.pos.z += (dz / len) * 12 * dt;
    }

    // 운반 중이면 내 기지 도착 즉시 이전
    if (p0.carrying && inBaseZone(ppos, p0.baseId, 0)) {
      const r = arriveOwnBase(g, 'p0');
      if (r.ok) this.onToast('✅ 훔친 브레인롯을 내 것으로 만들었다!');
      else if (r.reason === 'base-full') {
        // 계속 들고 있음 — 안내만
      }
    }

    this.updateBotMovement(dt);

    // 브레인롯 뷰 갱신
    for (const view of this.brainrotViews.values()) {
      const inst = g.instance(view.uid);
      if (!inst) continue;

      // 걷기 보간
      if (view.walk) {
        const total = Math.max(1, view.walk.until - (view.walk.until - 2000));
        void total;
        const start = view.walk.until - 2000;
        const alpha = Math.min(1, Math.max(0, (now - start) / 2000));
        view.visual.group.position.lerpVectors(view.walk.from, view.walk.to, alpha);
        // 바운스
        view.visual.group.position.y = Math.abs(Math.sin(alpha * Math.PI * 3)) * 0.3 +
          (view.walk.from.y + (view.walk.to.y - view.walk.from.y) * alpha);
        view.label.position.set(
          view.visual.group.position.x,
          view.visual.group.position.y + 2.2,
          view.visual.group.position.z,
        );
        if (now >= view.walk.until) {
          view.walk = null;
          this.snapToSlot(view.uid);
        }
      }

      // 운반 중 — 운반자 머리 위
      if (inst.location === 'carried') {
        let carrierPos: THREE.Vector3 | null = null;
        for (const p of g.state.players) {
          if (p.carrying === inst.uid) {
            carrierPos = p.id === 'p0'
              ? this.player.pos
              : this.botViews.find((b) => b.id === p.id)?.pos ?? null;
          }
        }
        if (carrierPos) {
          view.visual.group.position.set(carrierPos.x, carrierPos.y + 2.6, carrierPos.z);
          view.label.visible = false;
          view.coin.visible = false;
        }
      } else {
        view.label.visible = true;
      }

      // 조명: 수입 중 코인 회전
      if (view.coin.visible) {
        view.coin.rotation.y += dt * 3;
        view.coin.position.y = (view.visual.group.position.y + 1.6) + Math.sin(t * 2 + view.visual.bobPhase) * 0.15;
      }

      // 무지개 애니메이션
      if (view.visual.rainbowMats.length > 0) {
        animateRainbow(view.visual.rainbowMats, t, view.visual.bobPhase);
      }

      // 카펫 컨베이어 — 북쪽 출입구에서 남쪽 끝까지 걷기
      if (inst.location === 'carpet' && view.carpetStartAt !== null) {
        const prog = Math.min(1, (now - view.carpetStartAt) / CARPET_WALK_MS);
        const sx = this.map.carpetStart.x + view.carpetJitter;
        const sz = this.map.carpetStart.z;
        const ex = this.map.carpetEnd.x + view.carpetJitter;
        const ez = this.map.carpetEnd.z;
        view.visual.group.position.set(
          sx + (ex - sx) * prog,
          0.15 + Math.abs(Math.sin(prog * Math.PI * 14 + view.visual.bobPhase)) * 0.18,
          sz + (ez - sz) * prog,
        );
        view.label.position.set(
          view.visual.group.position.x,
          2.6 * view.visual.group.scale.x + 0.8,
          view.visual.group.position.z,
        );
        if (prog >= 1) {
          // 남쪽 끝 도달 — 미판매 소멸
          this.game.removeInstance(view.uid);
          this.game.events.emit('despawned', { uid: view.uid });
        }
      }
    }

    // 디버그 HUD
    const income = this.gameTotalIncome('p0');
    const carrying = p0.carrying ? ' 🥷운반중' : '';
    this.debugEl.textContent =
      `💰 ${formatMoney(p0.money)}   ⚡${formatMoney(income)}/s   ♻️환생 ${p0.rebirth}\n` +
      `슬롯 ${this.ownedCount('p0')}/${p0.slots}${carrying}   [E]구매/훔치기 [F]잠금 [1-0]도구`;
  }

  ownedCount(playerId: string): number {
    return this.game.state.brainrots.filter(
      (i) => i.ownerId === playerId && i.location === 'base',
    ).length;
  }

  gameTotalIncome(playerId: string): number {
    let sum = 0;
    for (const inst of this.game.state.brainrots) {
      if (inst.ownerId === playerId && inst.location === 'base' && inst.earning) {
        sum += instanceIncome(inst);
      }
    }
    return sum;
  }
}
